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
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
 * 결제는 예약금 결제(PaymentService/Payment)와 완전히 분리된 독립 흐름 —
 * PortoneService(순수 Portone API 래퍼)만 재사용하고, 기존 결제 코드는 건드리지 않는다.
 *
 * 가격은 예시값(placeholder) — 실제 서비스 오픈 전 사업 판단으로 조정 필요.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdvertisementService {

    // 가격 정책 (예시값 — 나중에 조정)
    private static final int BADGE_PRICE_PER_DAY  = 1_000;
    private static final int BANNER_PRICE_PER_DAY = 5_000;
    // 배너 이미지 최대 장수 — Store 상세 이미지(최대 5장)와 동일하게 통일
    private static final int MAX_BANNER_IMAGES = 5;

    private final AdvertisementRepository advertisementRepository;
    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final PortoneService portoneService;
    private final AdCounterBuffer adCounterBuffer;
    private final AuditLogService auditLogService;

    /**
     * 광고 신청 + 결제 준비 (사업자용, 본인 가게만)
     */
    @Transactional
    public AdPaymentPrepareResponse createAd(AdCreateRequest request, Member owner) {
        Store store = storeRepository.findById(request.getStoreId())
                .orElseThrow(StoreException::notFound);

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

        int pricePerDay = adType == AdType.BADGE ? BADGE_PRICE_PER_DAY : BANNER_PRICE_PER_DAY;
        int amount = (int) (pricePerDay * days);

        String merchantUid = "AD-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + "-" + UUID.randomUUID().toString().substring(0, 6);

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

    /**
     * 결제창에 넘길 구매자 이름을 고른다.
     *
     * <h3>★ {@code SecurityUtil.getCurrentMember()} 의 이름을 쓰면 안 된다</h3>
     * 그 Member 는 DB 에서 온 게 아니라 <b>JWT 클레임으로 재조립한 것</b>이라
     * {@code id}·{@code email}·{@code role} 만 채워져 있고 <b>{@code name} 은 항상 null</b> 이다
     * ({@code TokenProvider.getMemberFromTokenWithoutDB} 참고).
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

    /**
     * 결제 재시도 준비 (사업자용, 본인 가게만).
     * PENDING_PAYMENT(팝업을 닫거나 이탈해 결제를 안 한 경우) 또는 PAYMENT_FAILED 상태에서만 가능.
     * 포트원은 결제 시도마다 새 merchantUid가 필요하므로 재발급 후 저장한다 (가게/이미지/기간 등 기존 신청 내용은 그대로 유지).
     */
    @Transactional
    public AdPaymentPrepareResponse preparePayment(Long adId, Member owner) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(AdvertisementException::notFound);

        if (ad.getStore().getOwner() == null || !ad.getStore().getOwner().getId().equals(owner.getId())) {
            throw AdvertisementException.forbidden("본인 광고만 결제할 수 있습니다.");
        }
        if (ad.getStatus() != AdStatus.PENDING_PAYMENT && ad.getStatus() != AdStatus.PAYMENT_FAILED) {
            throw new AdvertisementException("결제할 수 없는 상태입니다.", HttpStatus.BAD_REQUEST);
        }
        // ★ 노출 시작일이 지났으면 결제를 막는다 — createAd 와 같은 규칙이다.
        //
        // 예전엔 이 검사가 없어서 **신규 신청은 막으면서 재결제는 통과하는 비대칭**이 있었다.
        // 그 결과 2026-07-17~18 짜리 광고를 8월에 결제할 수 있었고, 결제하면 ACTIVE 가 됐다가
        // 다음 스케줄러에서 곧바로 EXPIRED 로 넘어갔다 — **돈만 내고 노출은 0일**이었다.
        //
        // endDate 가 아니라 startDate 를 기준으로 삼는다: 기간이 일부만 남은 경우에도
        // 결제한 만큼 노출되지 않으므로, 부분 소진 자체를 허용하지 않는다(사용자 결정 2026-08-18).
        if (ad.getStartDate() != null && ad.getStartDate().isBefore(ServiceTime.today())) {
            throw new AdvertisementException(
                    "노출 시작일이 지난 광고는 결제할 수 없습니다. 새로 신청해주세요.", HttpStatus.BAD_REQUEST);
        }

        String merchantUid = "AD-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + "-" + UUID.randomUUID().toString().substring(0, 6);
        ad.setMerchantUid(merchantUid);
        ad.setStatus(AdStatus.PENDING_PAYMENT);

        log.info("Advertisement payment re-prepared: adId={}, merchantUid={}", ad.getId(), merchantUid);

        return AdPaymentPrepareResponse.builder()
                .adId(ad.getId())
                .merchantUid(merchantUid)
                .amount(ad.getAmount())
                .productName(ad.getStore().getName() + " " + (ad.getAdType() == AdType.BADGE ? "광고 배지" : "배너 광고"))
                .buyerName(resolveBuyerName(ad.getStore().getOwner(), owner.getEmail()))
                .buyerEmail(owner.getEmail())
                .buyerTel("")
                .storeId(portoneService.getStoreId())
                .build();
    }

    /**
     * 결제 검증 + 광고 활성화 (사업자용) — 결제 완료 즉시 ACTIVE(사전 승인 없음, 사후 제재 방식)
     */
    @Transactional
    public AdvertisementResponse verifyPayment(String merchantUid, Member owner) {
        Advertisement ad = advertisementRepository.findByMerchantUid(merchantUid)
                .orElseThrow(AdvertisementException::notFound);

        if (ad.getStore().getOwner() == null || !ad.getStore().getOwner().getId().equals(owner.getId())) {
            throw AdvertisementException.forbidden("본인 광고만 결제할 수 있습니다.");
        }

        return doVerifyAndActivate(ad);
    }

    /**
     * 모바일 결제 리다이렉트 전용 검증 (2026-07 추가).
     * 포트원이 결제 후 돌려보내는 GET 콜백은 인증 헤더(JWT) 없이 브라우저가 직접
     * 마지막으로 이동해서 오는 것이라 owner를 알 방법이 없다 — 예약 결제의
     * /api/payment/mobile-redirect와 동일한 보안 모델(merchantUid 자체가 포트원에서만
     * 발급되는 유일 식별자라 이것으로 충분하다고 본다)을 따른다 — 소유자 검증만 생략하고
     * 결제 검증/활성화 로직은 완전히 동일하다.
     */
    @Transactional
    public AdvertisementResponse verifyPaymentByMerchantUid(String merchantUid) {
        Advertisement ad = advertisementRepository.findByMerchantUid(merchantUid)
                .orElseThrow(AdvertisementException::notFound);
        return doVerifyAndActivate(ad);
    }

    private AdvertisementResponse doVerifyAndActivate(Advertisement ad) {
        PortoneV2PaymentResponse payment = portoneService.getPaymentInfo(ad.getMerchantUid());

        if (payment.getAmount() != ad.getAmount()) {
            ad.setStatus(AdStatus.PAYMENT_FAILED);
            throw new AdvertisementException("결제 금액이 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        if (!payment.isPaid()) {
            ad.setStatus(AdStatus.PAYMENT_FAILED);
            throw new AdvertisementException("결제가 완료되지 않았습니다.", HttpStatus.BAD_REQUEST);
        }

        ad.setStatus(AdStatus.ACTIVE);
        log.info("Advertisement activated: adId={}, merchantUid={}", ad.getId(), ad.getMerchantUid());
        return AdvertisementResponse.fromEntity(ad);
    }

    /** 노출용 — 공개 API, 타입별 ACTIVE + 기간 내 광고 목록 (최근 결제순 — 배너 독점 방지) */
    @Transactional(readOnly = true)
    public List<AdvertisementResponse> getActiveAds(AdType adType) {
        LocalDate today = ServiceTime.today();
        return advertisementRepository
                .findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAtDesc(
                        AdStatus.ACTIVE, adType, today, today)
                .stream()
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
        Pageable pageable = PageRequest.of(page, size);
        String normalized = (keyword == null) ? "" : keyword.trim();
        return advertisementRepository.searchForAdmin(normalized, pageable)
                .map(AdvertisementResponse::fromEntity);
    }

    /** 광고 강제 중단 (관리자용) — 사전 승인 대신 사후 제재 */
    @Transactional
    public void suspendAd(Long adId, String reason) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(AdvertisementException::notFound);
        ad.setStatus(AdStatus.SUSPENDED);
        ad.setSuspendReason(reason != null ? reason : "운영 정책 위반");
        log.info("Advertisement suspended: adId={}, reason={}", adId, reason);
    }

    /**
     * 광고 취소 (사업자용, 본인 가게만).
     * 결제 대기 중(PENDING_PAYMENT)이면 실제로 결제된 돈이 없으므로 그냥 취소 처리만 함.
     * 이미 결제 완료(ACTIVE)면 PortoneService로 전액 환불 후 상태 전환.
     */
    @Transactional
    public void cancelAd(Long adId, Member owner) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(AdvertisementException::notFound);

        if (ad.getStore().getOwner() == null || !ad.getStore().getOwner().getId().equals(owner.getId())) {
            throw AdvertisementException.forbidden("본인 광고만 취소할 수 있습니다.");
        }

        if (ad.getStatus() == AdStatus.PENDING_PAYMENT || ad.getStatus() == AdStatus.PAYMENT_FAILED) {
            AdStatus previousStatus = ad.getStatus();
            ad.setStatus(AdStatus.CANCELLED);
            log.info("Advertisement cancelled before payment: adId={}, previousStatus={}", adId, previousStatus);
        } else if (ad.getStatus() == AdStatus.ACTIVE) {
            portoneService.cancelPayment(ad.getMerchantUid(), null, "사업자 요청 광고 취소");
            ad.setStatus(AdStatus.REFUNDED);
            log.info("Advertisement refunded: adId={}, merchantUid={}", adId, ad.getMerchantUid());
        } else {
            throw new AdvertisementException("취소할 수 없는 상태입니다.", HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 배너 광고 콘텐츠(제목/설명/이미지) 수정 (사업자용, 본인 가게만).
     * 2026-07 추가 — 가게/유형/기간은 결제 금액과 엮여있어 수정 범위 밖(바꾸려면 취소 후 재신청).
     * BADGE는 title/description/images 자체가 없으므로(BANNER만 사용) 수정 대상이 아니다.
     * CANCELLED/EXPIRED/SUSPENDED/REFUNDED는 이미 끝난 광고라 수정 불가(cancelAd와 동일한 상태 체크 철학).
     */
    @Transactional
    public AdvertisementResponse updateAd(Long adId, AdUpdateRequest request, Member owner) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(AdvertisementException::notFound);

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
        // 2026-07 버그수정 — 교체만 하고 예전 이미지를 S3에서 지우지 않았다(StoreService.updateStoreImages는
        // 교체/삭제된 파일을 항상 fileStorageService.deleteFile로 정리하는데 이 메소드만 빠져있었음) —
        // 그대로 두면 사용자가 배너를 여러 번 고칠수록 고아(orphan) 파일이 버킷에 계속 쌓여 스토리지 비용만
        // 늘어난다. 새 이미지가 실제로 업로드되고 난 다음(예외 발생 시 예전 파일은 그대로 남아있어야 하므로)
        // 예전 URL을 먼저 지운다.
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
                oldImageUrls.forEach(fileStorageService::deleteFile);
            }
        }

        log.info("Advertisement updated: adId={}", adId);
        return AdvertisementResponse.fromEntity(ad);
    }

    /** 매일 자정 스케줄러 — endDate 지난 ACTIVE 광고를 EXPIRED로 전환 */
    @Transactional
    public void expireOverdueAds() {
        List<Advertisement> overdue = advertisementRepository
                .findByStatusAndEndDateBefore(AdStatus.ACTIVE, ServiceTime.today());
        overdue.forEach(ad -> ad.setStatus(AdStatus.EXPIRED));
        if (!overdue.isEmpty()) {
            log.info("Expired {} overdue advertisements", overdue.size());
        }
    }

    /**
     * 결제되지 않은 채 노출 시작일이 지난 광고를 <b>취소</b>로 정리한다.
     *
     * <h3>왜 필요한가</h3>
     * {@link #expireOverdueAds} 는 {@code ACTIVE} 만 보기 때문에, 결제하지 않은 신청은
     * 기간이 아무리 지나도 <b>"결제 대기" 상태로 목록에 영원히 남아 있었다.</b>
     * 거기 붙은 결제 버튼이 계속 살아 있어서 이미 지나간 기간에 돈을 낼 수 있었다.
     * {@code preparePayment} 에 시작일 검사를 넣어 결제 자체는 막았지만, 그것만으로는
     * 누를 수 없는 버튼이 계속 보인다 — 원인은 <b>죽은 신청이 정리되지 않는 것</b>이다.
     *
     * <h3>왜 EXPIRED 가 아니라 CANCELLED 인가</h3>
     * {@code EXPIRED} 는 "노출을 마치고 끝났다"는 뜻이라, 한 번도 노출된 적 없는 건에 붙이면
     * 통계와 이력이 거짓말을 한다. 돈이 오간 적도 없으므로 환불 경로도 필요 없다.
     * 예약에서 승인되지 않은 채 시간이 지난 건을 취소로 정리하는 것과 같은 성격이다.
     *
     * <p>돈을 건드리지 않는다 — 애초에 결제되지 않은 건만 대상이다.
     */
    @Transactional
    public void cancelUnpaidOverdueAds() {
        List<Advertisement> stale = advertisementRepository.findByStatusInAndStartDateBefore(
                List.of(AdStatus.PENDING_PAYMENT, AdStatus.PAYMENT_FAILED), ServiceTime.today());
        stale.forEach(ad -> ad.setStatus(AdStatus.CANCELLED));
        if (!stale.isEmpty()) {
            log.info("Cancelled {} unpaid advertisements past their start date", stale.size());
        }
    }

    /**
     * 광고 목록에서 숨기기(소프트삭제) — 2026-07 추가.
     * 종료상태(EXPIRED/CANCELLED/REFUNDED/SUSPENDED)인 본인 가게 광고만 가능 — cancelAd와 동일하게
     * 관리자 우회 없이 본인 확인만(기존 서비스 메서드들과 일관성 유지).
     * 예약(ReservationService.removeReservation)과 동일한 패턴 — 결제/노출 이력은 그대로
     * 보존하고 목록에서만 숨김(30일 휴지통 보관 후 자동 영구삭제).
     */
    @Transactional
    public void removeAd(Long adId, Member owner) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(AdvertisementException::notFound);

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
