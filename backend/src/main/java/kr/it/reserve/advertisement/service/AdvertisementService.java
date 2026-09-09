package kr.it.reserve.advertisement.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.advertisement.dto.AdCreateRequest;
import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdUpdateRequest;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import kr.it.reserve.global.common.PageRequests;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.BiConsumer;
import java.util.stream.Collectors;

/**
 * 가게 광고 서비스.
 *
 * 광고 콘텐츠·노출을 관리한다. 금융 상태는 AdPaymentService/AdPaymentLedgerService의 관문을 거친다.
 * 예약 결제 원장과 광고 시도 원장은 분리하고 PortOne 통신·웹훅 inbox만 공유한다.
 * 단계별 실패 복구와 수동 확인 경계는 docs/technical/ad-payments.md를 따른다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdvertisementService {

    // 현재 적용 중인 일 단위 가격 정책. 변경 시 결제 금액·사용자 안내를 함께 검토한다.
    private static final int BADGE_PRICE_PER_DAY  = 1_000;
    private static final int BANNER_PRICE_PER_DAY = 5_000;
    // 배너 이미지 최대 장수 — Store 상세 이미지(최대 5장)와 동일하게 통일
    private static final int MAX_BANNER_IMAGES = 5;

    private final AdvertisementRepository advertisementRepository;
    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final FileDeletionOutboxService fileDeletionOutboxService;
    private final PortoneService portoneService;
    private final AdPaymentService adPaymentService;
    private final AdPaymentLedgerService adPaymentLedgerService;
    private final AdCounterBuffer adCounterBuffer;
    private final AuditLogService auditLogService;

    /**
     * 광고 신청 + 결제 준비 (사업자용, 본인 가게만)
     */
    @Transactional
    public AdPaymentPrepareResponse createAd(AdCreateRequest request, Member owner) {
        // 영업 종료와 같은 가게 행 잠금을 쓴다. 준비도 확인 직후 새 광고가 끼어드는
        // check-then-close 레이스를 막고, 이미 종료된 가게에는 신청을 만들지 않는다.
        Store store = storeRepository.findByIdForUpdate(request.getStoreId())
                .orElseThrow(StoreException::notFound);

        if (store.isDeleted()) {
            throw StoreException.notFound();
        }
        if (store.isSuspended()) {
            throw StoreException.forbidden("운영이 중단된 가게에는 광고를 등록할 수 없습니다.");
        }

        if (store.getOwner() == null || !store.getOwner().getId().equals(owner.getId())) {
            throw StoreException.forbidden("본인 가게에만 광고를 등록할 수 있습니다.");
        }

        AdType adType;
        try {
            adType = AdType.valueOf(request.getAdType());
        } catch (Exception e) {
            throw new AdvertisementException("광고 유형이 올바르지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        // 중복 신청 방지(2026-07 추가): 카카오페이 결제창이 닫히지 않은 채로 남아있거나 사용자가 결제를
        // 마무리지으면 모달을 닫고 "새 광고 신청"을 다시 누를 수 있어, 같은 가게+타입으로 결제 대기/실패
        // 상태인 신청이 이미 쌓이는 버그가 있었다 — 같은 건이 있으면 새로 만들지 않고 기존 신청을 재사용하게 막는다.
        advertisementRepository
                .findFirstByStoreIdAndAdTypeAndStatusIn(store.getId(), adType,
                        List.of(AdStatus.PENDING_PAYMENT, AdStatus.PAYMENT_FAILED))
                .ifPresent(existing -> {
                    throw new AdvertisementException(
                            "이미 결제 대기 중인 " + (adType == AdType.BADGE ? "배지형" : "배너형") +
                            " 신청이 있습니다. 기존 신청을 결제하거나 취소한 후 다시 시도해주세요.",
                            HttpStatus.CONFLICT);
                });

        if (request.getStartDate() == null || request.getEndDate() == null) {
            throw new AdvertisementException("노출 시작일과 종료일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (request.getStartDate().isBefore(ServiceTime.today())) {
            throw new AdvertisementException("시작일은 오늘 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw new AdvertisementException("종료일은 시작일 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }

        long days = ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate()) + 1;
        int amount = calculateAmount(adType, days);
        validateContentLength(request.getTitle(), request.getDescription());

        List<String> imageUrls = new java.util.ArrayList<>();
        if (adType == AdType.BANNER) {
            List<MultipartFile> images = request.getImages();
            if (images == null || images.isEmpty() || images.stream().allMatch(MultipartFile::isEmpty)) {
                throw new AdvertisementException("배너 광고는 이미지가 최소 1장 필요합니다.", HttpStatus.BAD_REQUEST);
            }
            if (images.size() > MAX_BANNER_IMAGES) {
                throw new AdvertisementException("배너 이미지는 최대 " + MAX_BANNER_IMAGES + "장까지 등록할 수 있습니다.", HttpStatus.BAD_REQUEST);
            }
            if (request.getTitle() == null || request.getTitle().trim().isEmpty()) {
                throw new AdvertisementException("배너 광고는 제목이 필수입니다.", HttpStatus.BAD_REQUEST);
            }
            for (MultipartFile image : images) {
                if (image.isEmpty()) continue;
                String key = fileStorageService.storeFile(
                        image, FileStoragePaths.advertisement(owner.getId(), store.getId()));
                imageUrls.add(fileStorageService.getPublicUrl(key));
            }
        }

        String merchantUid = "AD-" + UUID.randomUUID();

        Advertisement ad = Advertisement.builder()
                .store(store)
                .adType(adType)
                .title(request.getTitle())
                .description(request.getDescription())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .amount(amount)
                .merchantUid(merchantUid)
                .status(AdStatus.PENDING_PAYMENT)
                .build();
        ad.setImageUrlList(imageUrls);

        advertisementRepository.save(ad);
        adPaymentLedgerService.registerNew(ad);
        log.info("Advertisement created (pending payment): adId={}, storeId={}, type={}, amount={}",
                ad.getId(), store.getId(), adType, amount);

        return AdPaymentPrepareResponse.builder()
                .adId(ad.getId())
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(store.getName() + " " + (adType == AdType.BADGE ? "광고 배지" : "배너 광고"))
                .buyerName(resolveBuyerName(store.getOwner(), owner.getEmail()))
                .buyerEmail(owner.getEmail())
                .buyerTel("")
                .storeId(portoneService.getStoreId())
                .build();
    }

    static int calculateAmount(AdType adType, long days) {
        int pricePerDay = adType == AdType.BADGE ? BADGE_PRICE_PER_DAY : BANNER_PRICE_PER_DAY;
        // int로 잘라 음수·다른 금액을 만들지 않는다. 파일 업로드나 PG 호출 전에 거부한다.
        if (days <= 0 || days > Integer.MAX_VALUE / pricePerDay) {
            throw new AdvertisementException("광고 기간이 결제 가능한 범위를 벗어났습니다.", HttpStatus.BAD_REQUEST);
        }
        return Math.toIntExact(pricePerDay * days);
    }

    private static void validateContentLength(String title, String description) {
        if (title != null && title.length() > 100) {
            throw new AdvertisementException("광고 제목은 100자 이내로 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (description != null && description.length() > 300) {
            throw new AdvertisementException("광고 설명은 300자 이내로 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 결제창에 넘길 구매자 이름을 고른다.
     *
     * <h3>구매자 이름은 결제 대상 가게의 소유자 행에서 고른다</h3>
     * 인증 principal도 현재는 탈퇴 즉시 차단을 위해 DB에서 읽지만, 결제 데이터는 인증 표현보다
     * 결제 대상 도메인에서 가져오는 편이 경계가 분명하다.
     *
     * <p>그대로 넘기면 PortOne V2 가 <i>"data.customer.fullName 파라미터가 string 형식이 아닙니다"</i>
     * 로 거절해 <b>결제창이 아예 안 열린다.</b> V1 은 이 값을 느슨하게 받아 넘어갔지만
     * V2 는 타입을 엄격히 검증한다 — 즉 null 은 원래 있었고 V2 전환이 드러낸 것이다.
     *
     * <p>여기 넘어오는 {@code storeOwner} 는 {@code storeRepository} 로 조회한 엔티티의 소유자라
     * 실제 행이 로드된다. 호출부가 이미 {@code storeOwner.getId().equals(owner.getId())} 로
     * 동일인임을 확인한 뒤이므로 다른 사람 이름이 들어갈 일은 없다.
     * (같은 문제를 {@code ReservationService} 는 {@code memberRepository.findById} 로 다시 읽어 피한다.)
     *
     * <p>마지막 폴백을 두는 이유: 이름이 비어 있는 계정이 하나라도 있으면 결제 자체가 막힌다.
     * 결제창의 표시용 값일 뿐이라, 막느니 이메일 앞부분이라도 채워 보내는 쪽이 낫다.
     */
    private String resolveBuyerName(Member storeOwner, String fallbackEmail) {
        if (storeOwner != null && storeOwner.getName() != null && !storeOwner.getName().isBlank()) {
            return storeOwner.getName();
        }
        log.warn("Advertisement payment: store owner name is missing, falling back to email local-part");
        if (fallbackEmail != null && fallbackEmail.contains("@")) {
            return fallbackEmail.substring(0, fallbackEmail.indexOf('@'));
        }
        return "고객";
    }

    /** PG 상태를 재확인한 뒤 동일 READY를 재사용하거나 확정 실패 시도만 교체한다. */
    public AdPaymentPrepareResponse preparePayment(Long adId, Member owner) {
        return adPaymentService.prepare(adId, owner.getId());
    }

    public AdvertisementResponse verifyPayment(String merchantUid, Member owner) {
        return adPaymentService.verify(merchantUid, owner.getId());
    }

    /** 모바일 콜백은 인증 증거가 아니다. PG 재조회와 원장 상태 전이는 동일한 관문을 거친다. */
    public AdvertisementResponse verifyPaymentByMerchantUid(String merchantUid) {
        return adPaymentService.verify(merchantUid, null);
    }

    /** 공개 노출 — 타입별 ACTIVE + 기간 내 광고를 생성일 역순으로 조회하고 삭제·정지 가게를 제외한다. */
    @Transactional(readOnly = true)
    public List<AdvertisementResponse> getActiveAds(AdType adType) {
        LocalDate today = ServiceTime.today();
        return advertisementRepository
                .findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAtDesc(
                        AdStatus.ACTIVE, adType, today, today)
                .stream()
                .filter(ad -> !ad.isDeleted() && !ad.getStore().isDeleted() && !ad.getStore().isSuspended())
                .map(AdvertisementResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /** 내 광고 신청 내역 (사업자용) */
    @Transactional(readOnly = true)
    public List<AdvertisementResponse> getMyAds(Member owner) {
        return advertisementRepository.findByStoreOwnerOrderByCreatedAtDesc(owner)
                .stream()
                .map(AdvertisementResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /** 전체 광고 목록 (관리자용) */
    @Transactional(readOnly = true)
    public Page<AdvertisementResponse> getAllAds(int page, int size) {
        return getAllAds(page, size, null);
    }

    /**
     * 관리자 광고 목록 (가게 이름 검색).
     *
     * <p>검색을 서버에서 하는 이유는 {@code AdvertisementRepository#searchForAdmin} 주석 참고 —
     * 요약하면 예전에는 프론트가 현재 페이지만 필터링해서 다른 페이지의 광고가 검색되지 않았다.
     *
     * <p>keyword는 여기서 빈 문자열로 정규화한다. 쿼리 쪽에서 NULL 분기를 없애기 위한 것이고,
     * 공백만 입력한 경우도 "검색 안 함"으로 취급하는 게 사용자 기대에 맞다.
     */
    public Page<AdvertisementResponse> getAllAds(int page, int size, String keyword) {
        Pageable pageable = PageRequests.bounded(page, size);
        String normalized = (keyword == null) ? "" : keyword.trim();
        return advertisementRepository.searchForAdmin(normalized, pageable)
                .map(AdvertisementResponse::fromEntity);
    }

    /** 광고 강제 중단 (관리자용) — 사전 승인 대신 사후 제재 */
    @Transactional
    public void suspendAd(Long adId, String reason) {
        Advertisement ad = adPaymentLedgerService.lockAdvertisement(adId);
        ad.setStatus(AdStatus.SUSPENDED);
        ad.setSuspendReason(reason != null ? reason : "운영 정책 위반");
        log.info("Advertisement suspended: adId={}", adId);
    }

    /** 취소 의도를 먼저 커밋한다. 환불 완료는 별도 PG 대사가 확인한다. */
    public void cancelAd(Long adId, Member owner) {
        adPaymentService.cancel(adId, owner.getId());
    }

    /**
     * 배너 광고 콘텐츠(제목/설명/이미지) 수정 (사업자용, 본인 가게만).
     * 2026-07 추가 — 가게/유형/기간은 결제 금액과 엮여있어 수정 범위 밖(바꾸려면 취소 후 재신청).
     * BADGE는 title/description/images 자체가 없으므로(BANNER만 사용) 수정 대상이 아니다.
     * CANCELLED/EXPIRED/SUSPENDED/REFUNDED는 이미 끝난 광고라 수정 불가(cancelAd와 동일한 상태 체크 철학).
     */
    @Transactional
    public AdvertisementResponse updateAd(Long adId, AdUpdateRequest request, Member owner) {
        Advertisement ad = adPaymentLedgerService.lockAdvertisement(adId);

        if (ad.getStore().getOwner() == null || !ad.getStore().getOwner().getId().equals(owner.getId())) {
            throw AdvertisementException.forbidden("본인 광고만 수정할 수 있습니다.");
        }
        if (ad.getAdType() != AdType.BANNER) {
            throw new AdvertisementException("배지형 광고는 수정할 내용이 없습니다.", HttpStatus.BAD_REQUEST);
        }
        if (ad.getStatus() != AdStatus.PENDING_PAYMENT && ad.getStatus() != AdStatus.PAYMENT_FAILED
                && ad.getStatus() != AdStatus.ACTIVE) {
            throw new AdvertisementException("수정할 수 없는 상태입니다.", HttpStatus.BAD_REQUEST);
        }

        validateContentLength(request.getTitle(), request.getDescription());
        if (request.getTitle() != null) {
            if (request.getTitle().trim().isEmpty()) {
                throw new AdvertisementException("배너 광고는 제목이 필수입니다.", HttpStatus.BAD_REQUEST);
            }
            ad.setTitle(request.getTitle());
        }
        if (request.getDescription() != null) {
            ad.setDescription(request.getDescription());
        }

        // images가 null이면 기존 이미지 유지 — 값이 있으면 통째로 교체(createAd와 동일한 검증/업로드 규칙).
        // 새 파일은 트랜잭션 롤백 시 보상 삭제되고, 기존 파일은 커밋 뒤 outbox worker가 삭제한다.
        List<MultipartFile> images = request.getImages();
        if (images != null && !images.isEmpty() && images.stream().anyMatch(f -> !f.isEmpty())) {
            if (images.size() > MAX_BANNER_IMAGES) {
                throw new AdvertisementException("배너 이미지는 최대 " + MAX_BANNER_IMAGES + "장까지 등록할 수 있습니다.", HttpStatus.BAD_REQUEST);
            }
            List<String> newImageUrls = new java.util.ArrayList<>();
            for (MultipartFile image : images) {
                if (image.isEmpty()) continue;
                String key = fileStorageService.storeFile(
                        image, FileStoragePaths.advertisement(owner.getId(), ad.getStore().getId()));
                newImageUrls.add(fileStorageService.getPublicUrl(key));
            }
            List<String> oldImageUrls = ad.getImageUrlList();
            ad.setImageUrlList(newImageUrls);
            if (oldImageUrls != null) {
                oldImageUrls.forEach(image -> fileDeletionOutboxService.enqueue(
                        image, "ADVERTISEMENT_IMAGE", ad.getId()));
            }
        }

        log.info("Advertisement updated: adId={}", adId);
        return AdvertisementResponse.fromEntity(ad);
    }

    /** 광고별 독립 잠금으로 결제·취소와 직렬화한다. */
    public void expireOverdueAds() {
        List<Advertisement> overdue = advertisementRepository
                .findByStatusAndEndDateBefore(AdStatus.ACTIVE, ServiceTime.today());
        overdue.forEach(ad -> adPaymentLedgerService.expire(ad.getId()));
        if (!overdue.isEmpty()) {
            log.info("Expired {} overdue advertisements", overdue.size());
        }
    }

    /** 지난 신청은 숨기되 결제 결과는 원장 대사가 끝날 때까지 미결로 보존한다. */
    public void cancelUnpaidOverdueAds() {
        List<Advertisement> stale = advertisementRepository.findByStatusInAndStartDateBefore(
                List.of(AdStatus.PENDING_PAYMENT, AdStatus.PAYMENT_FAILED), ServiceTime.today());
        stale.forEach(ad -> adPaymentLedgerService.expire(ad.getId()));
        if (!stale.isEmpty()) {
            log.info("Cancelled {} unpaid advertisements past their start date", stale.size());
        }
    }

    /**
     * 광고 목록에서 숨기기(소프트삭제) — 2026-07 추가.
     * 종료상태(EXPIRED/CANCELLED/REFUNDED/SUSPENDED)인 본인 가게 광고만 가능 — cancelAd와 동일하게
     * 관리자 우회 없이 본인 확인만(기존 서비스 메서드들과 일관성 유지).
     * 예약(ReservationService.removeReservation)과 동일한 패턴 — 결제/노출 이력은 그대로
     * 보존하고 목록에서만 숨긴다. 금융 이력은 승인된 보존 정책 없이 영구삭제하지 않는다.
     */
    @Transactional
    public void removeAd(Long adId, Member owner) {
        Advertisement ad = adPaymentLedgerService.lockAdvertisement(adId);

        if (ad.getStore().getOwner() == null || !ad.getStore().getOwner().getId().equals(owner.getId())) {
            throw AdvertisementException.forbidden("본인 광고만 삭제할 수 있습니다.");
        }

        boolean isDeletable = ad.getStatus() == AdStatus.EXPIRED
                || ad.getStatus() == AdStatus.CANCELLED
                || ad.getStatus() == AdStatus.REFUNDED
                || ad.getStatus() == AdStatus.SUSPENDED;

        if (!isDeletable) {
            throw new AdvertisementException("만료·취소·환불·중단 상태의 광고만 삭제할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }

        adPaymentLedgerService.requireResolvedForRemoval(adId);
        auditLogService.softDeleteAdvertisement(adId);
        log.info("Advertisement removed: adId={}, ownerId={}", adId, owner.getId());
    }

    /**
     * 광고 성과 지표 기록(2026-07 추가) — 누구나 볼 수 있는 공개 엔드포인트(로그인 불필요).
     * 광고는 장식적 요소라 실패해도 조용히 무시 — 호출측에서는 에러를 사용자에게 노출하지 않는다.
     * 봇/중복 집계 방지용 rate limiting은 현재 미구현 — 지금 규모에서는 허용 가능한 트레이드오프로 남겨둔다.
     *
     * 2026-07 추가 개선 — 예전엔 여기서 바로 findById + save(dirty checking)로 DB를 즉시 건드려서,
     * 노출 하나마다 SELECT + UPDATE가 나갔다. 지금은 AdCounterBuffer에 인메모리로만 쌓아두고,
     * 실제 DB 반영은 AdCounterFlushScheduler가 30초마다 한 번에 처리한다(RateLimiter와 동일한
     * in-memory 패턴). 그래서 이 메서드들엔 더 이상 @Transactional이 필요 없다 — DB를 안 건드리니까.
     */
    public void recordImpression(Long adId) {
        adCounterBuffer.increment(adId, AdCounterBuffer.CounterType.IMPRESSION);
    }

    /** 배너 클릭 기록(2026-07 추가) — BANNER만 호출(BADGE는 프론트에서 자체적으로 호출 안 함) */
    public void recordClick(Long adId) {
        adCounterBuffer.increment(adId, AdCounterBuffer.CounterType.CLICK);
    }

    /**
     * 전환 기록(2026-07 추가) — 프론트가 sessionStorage로 "이 예약이 배너 클릭에서 이어졌다"를 판단해서
     * 예약 생성 직후에 호출한다. 서버에서 귀속 윈도를 재검증하지 않는다(단순 지표용 카운터라 적당한
     * 수준의 신뢰도로 충분 — 결제/정산과 무관한 단순 참고용 지표이므로 서버 측 재검증은 과잉이라 생략).
     */
    public void recordConversion(Long adId) {
        adCounterBuffer.increment(adId, AdCounterBuffer.CounterType.CONVERSION);
    }

    /**
     * AdCounterBuffer에 쌓인 노출/클릭/전환 카운터를 DB에 일괄 반영 (AdCounterFlushScheduler 전용).
     * adId별로 델타(누적 증가분)만 계산해서 "UPDATE ... SET count = count + delta" 한 방으로 처리 —
     * 광고 개수만큼만 UPDATE가 나가지, 이벤트 개수만큼 나가지 않는다.
     */
    @Transactional
    public void flushCounters() {
        flushBucket(adCounterBuffer.swapAndGet(AdCounterBuffer.CounterType.IMPRESSION), advertisementRepository::addImpressionCount);
        flushBucket(adCounterBuffer.swapAndGet(AdCounterBuffer.CounterType.CLICK), advertisementRepository::addClickCount);
        flushBucket(adCounterBuffer.swapAndGet(AdCounterBuffer.CounterType.CONVERSION), advertisementRepository::addConversionCount);
    }

    private void flushBucket(Map<Long, LongAdder> bucket, BiConsumer<Long, Long> updater) {
        bucket.forEach((adId, adder) -> {
            long delta = adder.sum();
            if (delta > 0) {
                updater.accept(adId, delta);
            }
        });
    }
}
