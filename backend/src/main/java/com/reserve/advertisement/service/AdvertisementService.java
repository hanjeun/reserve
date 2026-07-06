package com.reserve.advertisement.service;

import com.reserve.advertisement.dto.AdCreateRequest;
import com.reserve.advertisement.dto.AdPaymentPrepareResponse;
import com.reserve.advertisement.dto.AdvertisementResponse;
import com.reserve.advertisement.entity.AdStatus;
import com.reserve.advertisement.entity.AdType;
import com.reserve.advertisement.entity.Advertisement;
import com.reserve.advertisement.repository.AdvertisementRepository;
import com.reserve.file.service.FileStorageService;
import com.reserve.file.util.FileStoragePaths;
import com.reserve.global.error.AdvertisementException;
import com.reserve.global.error.StoreException;
import com.reserve.member.entity.Member;
import com.reserve.payment.dto.PortoneV2PaymentResponse;
import com.reserve.payment.service.PortoneService;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
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
import java.util.UUID;
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

    private final AdvertisementRepository advertisementRepository;
    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final PortoneService portoneService;

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

        if (request.getStartDate() == null || request.getEndDate() == null) {
            throw new AdvertisementException("노출 시작일과 종료일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (request.getStartDate().isBefore(LocalDate.now())) {
            throw new AdvertisementException("시작일은 오늘 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw new AdvertisementException("종료일은 시작일 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }

        long days = ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate()) + 1;

        String imageUrl = null;
        if (adType == AdType.BANNER) {
            MultipartFile image = request.getImage();
            if (image == null || image.isEmpty()) {
                throw new AdvertisementException("배너 광고는 이미지가 필수입니다.", HttpStatus.BAD_REQUEST);
            }
            if (request.getTitle() == null || request.getTitle().trim().isEmpty()) {
                throw new AdvertisementException("배너 광고는 제목이 필수입니다.", HttpStatus.BAD_REQUEST);
            }
            String key = fileStorageService.storeFile(
                    image, FileStoragePaths.advertisement(owner.getId(), store.getId()));
            imageUrl = fileStorageService.getPublicUrl(key);
        }

        int pricePerDay = adType == AdType.BADGE ? BADGE_PRICE_PER_DAY : BANNER_PRICE_PER_DAY;
        int amount = (int) (pricePerDay * days);

        String merchantUid = "AD-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + "-" + UUID.randomUUID().toString().substring(0, 6);

        Advertisement ad = Advertisement.builder()
                .store(store)
                .adType(adType)
                .imageUrl(imageUrl)
                .title(request.getTitle())
                .description(request.getDescription())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .amount(amount)
                .merchantUid(merchantUid)
                .status(AdStatus.PENDING_PAYMENT)
                .build();

        advertisementRepository.save(ad);
        log.info("Advertisement created (pending payment): adId={}, storeId={}, type={}, amount={}",
                ad.getId(), store.getId(), adType, amount);

        return AdPaymentPrepareResponse.builder()
                .adId(ad.getId())
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(store.getName() + " " + (adType == AdType.BADGE ? "광고 배지" : "배너 광고"))
                .buyerName(owner.getName())
                .buyerEmail(owner.getEmail())
                .buyerTel("")
                .impCode(portoneService.getImpCode())
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

        PortoneV2PaymentResponse payment = portoneService.getPaymentInfo(merchantUid);

        if (payment.getAmount() != ad.getAmount()) {
            ad.setStatus(AdStatus.PAYMENT_FAILED);
            throw new AdvertisementException("결제 금액이 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        if (!payment.isPaid()) {
            ad.setStatus(AdStatus.PAYMENT_FAILED);
            throw new AdvertisementException("결제가 완료되지 않았습니다.", HttpStatus.BAD_REQUEST);
        }

        ad.setStatus(AdStatus.ACTIVE);
        log.info("Advertisement activated: adId={}, merchantUid={}", ad.getId(), merchantUid);
        return AdvertisementResponse.fromEntity(ad);
    }

    /** 노출용 — 공개 API, 타입별 ACTIVE + 기간 내 광고 목록 */
    @Transactional(readOnly = true)
    public List<AdvertisementResponse> getActiveAds(AdType adType) {
        LocalDate today = LocalDate.now();
        return advertisementRepository
                .findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
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
        Pageable pageable = PageRequest.of(page, size);
        return advertisementRepository.findAllByOrderByCreatedAtDesc(pageable)
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

    /** 매일 자정 스케줄러 — endDate 지난 ACTIVE 광고를 EXPIRED로 전환 */
    @Transactional
    public void expireOverdueAds() {
        List<Advertisement> overdue = advertisementRepository
                .findByStatusAndEndDateBefore(AdStatus.ACTIVE, LocalDate.now());
        overdue.forEach(ad -> ad.setStatus(AdStatus.EXPIRED));
        if (!overdue.isEmpty()) {
            log.info("Expired {} overdue advertisements", overdue.size());
        }
    }
}
