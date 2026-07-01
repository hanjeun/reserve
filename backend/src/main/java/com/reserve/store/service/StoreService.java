package com.reserve.store.service;

import com.reserve.favorite.repository.FavoriteRepository;
import com.reserve.file.service.FileStorageService;
import com.reserve.file.util.FileStoragePaths;
import com.reserve.global.error.StoreException;
import com.reserve.member.entity.Member;
import com.reserve.payment.repository.PaymentRepository;
import com.reserve.promotion.repository.PromotionRepository;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.repository.StoreRepository;
import com.reserve.store.dto.StoreCreateRequest;
import com.reserve.store.dto.StoreResponse;
import com.reserve.store.dto.StoreUpdateRequest;
import com.reserve.store.entity.Store;
import com.reserve.store.entity.StoreStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@Slf4j
@RequiredArgsConstructor
@Service
public class StoreService {

    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final ReservationRepository reservationRepository;
    private final FavoriteRepository favoriteRepository;
    private final PromotionRepository promotionRepository;
    private final ReviewRepository reviewRepository;
    private final PaymentRepository paymentRepository;

    /**
     * 가게 등록
     * 순서: Store 먼저 저장(ID 획득) → 이미지 업로드(storeId 경로 사용) → 이미지 URL 업데이트
     */
    @Transactional
    public StoreResponse createStore(StoreCreateRequest request, Member owner) {

        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new StoreException("가게 이름은 필수입니다.", HttpStatus.BAD_REQUEST);
        }

        // 1단계: 이미지 없이 Store 먼저 저장 → storeId 확보
        Store store = Store.builder()
                .owner(owner)
                .name(request.getName().trim())
                .description(request.getDescription())
                .address(request.getAddress())
                .zipCode(request.getZipCode())
                .addressDetail(request.getAddressDetail())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .phone(request.getPhone())
                .category(request.getCategory())
                .rating(0.0)
                .reviewCount(0)
                .noShowDeposit(request.getNoShowDeposit() != null ? request.getNoShowDeposit() : 0)
                .fullRefundDays(request.getFullRefundDays() != null ? request.getFullRefundDays() : 3)
                .partialRefundDays(request.getPartialRefundDays() != null ? request.getPartialRefundDays() : 1)
                .partialRefundRate(request.getPartialRefundRate() != null ? request.getPartialRefundRate() : 50)
                .maxCapacityPerSlot(request.getMaxCapacityPerSlot())
                .autoApprovalEnabled(request.getAutoApprovalEnabled() != null ? request.getAutoApprovalEnabled() : false)
                .bookingDeadlineHours(request.getBookingDeadlineHours())
                .paymentTimeoutMinutes(request.getPaymentTimeoutMinutes() != null ? request.getPaymentTimeoutMinutes() : 30)
                .reservationSlotMinutes(request.getReservationSlotMinutes() != null ? request.getReservationSlotMinutes() : 30)
                .allowLatePayment(request.getAllowLatePayment() != null ? request.getAllowLatePayment() : false)
                .allowDuplicateReservation(request.getAllowDuplicateReservation() != null ? request.getAllowDuplicateReservation() : false)
                .emailNotificationEnabled(request.getEmailNotificationEnabled() != null ? request.getEmailNotificationEnabled() : true)
                .build();

        if (request.getKeywords() != null && !request.getKeywords().isEmpty()) {
            store.setKeywordList(request.getKeywords());
        }

        if (request.getOpenTime() != null && request.getCloseTime() != null) {
            store.setOpenTime(request.getOpenTime());
            store.setCloseTime(request.getCloseTime());
            store.setBreakStartTime(request.getBreakStartTime());
            store.setBreakEndTime(request.getBreakEndTime());
        }

        Store savedStore = storeRepository.save(store);
        Long storeId = savedStore.getId();
        Long memberId = owner.getId();

        // 2단계: storeId 확보 후 이미지 업로드 → getPublicUrl로 CloudFront URL 변환
        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            String key = fileStorageService.storeFile(
                    request.getMainImage(), FileStoragePaths.storeThumbnail(memberId, storeId));
            savedStore.setMainImageUrl(fileStorageService.getPublicUrl(key));
        }

        List<String> detailImageUrls = new ArrayList<>();
        if (request.getDetailImages() != null && !request.getDetailImages().isEmpty()) {
            for (MultipartFile file : request.getDetailImages()) {
                if (file != null && !file.isEmpty()) {
                    String key = fileStorageService.storeFile(
                            file, FileStoragePaths.storeImage(memberId, storeId));
                    detailImageUrls.add(fileStorageService.getPublicUrl(key));
                }
            }
        }

        if (!detailImageUrls.isEmpty()) {
            savedStore.setDetailImageList(detailImageUrls);
        }

        log.info("Store registered: storeId={}", storeId);
        return StoreResponse.fromEntity(savedStore);
    }

    /**
     * 내가 등록한 가게 목록 조회
     */
    @Transactional(readOnly = true)
    public List<StoreResponse> getMyStores(Member member) {
        List<Store> stores = storeRepository.findByOwnerAndDeletedAtIsNullOrderByCreatedAtDesc(member);
        return stores.stream()
                .map(StoreResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /**
     * 가게 수정용 데이터 조회 (소유자/관리자만 접근 가능)
     * 공개 API와 달리 소유자 본인 검증 후 전체 설정을 반환
     */
    @Transactional(readOnly = true)
    public StoreResponse getStoreForEdit(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getDeletedAt() != null) {
            throw StoreException.notFound();
        }
        // 관리자는 모든 가게 수정 가능, 소유자는 본인 가게만
        boolean isAdmin = member.isAdmin();
        boolean isOwner = store.getOwner() != null && store.getOwner().getId().equals(member.getId());
        if (!isAdmin && !isOwner) {
            throw StoreException.forbidden("가게를 수정할 권한이 없습니다.");
        }
        return StoreResponse.fromEntity(store);
    }

    /**
     * 가게 상세 조회
     * 제재(정지/영구정지) 가게는 일반 사용자에게는 조회 불가 — 소프트 삭제와 동일하게 처리
     */
    @Transactional(readOnly = true)
    public StoreResponse getStore(Long id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getDeletedAt() != null || store.isSuspended()) {
            throw StoreException.notFound();
        }
        return StoreResponse.fromEntity(store);
    }

    /**
     * 가게 수정
     */
    @Transactional
    public StoreResponse updateStore(Long id, StoreUpdateRequest request, Member member) {
        log.info("Store update started: storeId={}", id);

        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);

        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            log.error("Unauthorized store access: storeOwnerId={}, requestMemberId={}", store.getOwner().getId(), member.getId());
            throw StoreException.forbidden("가게를 수정할 권한이 없습니다.");
        }

        try {
            if (request.getName() != null) store.setName(request.getName());
            if (request.getDescription() != null) store.setDescription(request.getDescription());
            if (request.getAddress() != null) store.setAddress(request.getAddress());
            if (request.getZipCode() != null) store.setZipCode(request.getZipCode());
            if (request.getAddressDetail() != null) store.setAddressDetail(request.getAddressDetail());
            if (request.getLatitude() != null) store.setLatitude(request.getLatitude());
            if (request.getLongitude() != null) store.setLongitude(request.getLongitude());
            if (request.getPhone() != null) store.setPhone(request.getPhone());
            if (request.getCategory() != null) store.setCategory(request.getCategory());
            if (request.getNoShowDeposit() != null) store.setNoShowDeposit(request.getNoShowDeposit());
            if (request.getFullRefundDays() != null) store.setFullRefundDays(request.getFullRefundDays());
            if (request.getPartialRefundDays() != null) store.setPartialRefundDays(request.getPartialRefundDays());
            if (request.getPartialRefundRate() != null) store.setPartialRefundRate(request.getPartialRefundRate());
            // maxCapacityPerSlot: 항상 업데이트 (null = 무제한, 프론트가 명시적으로 보냄)
            store.setMaxCapacityPerSlot(request.getMaxCapacityPerSlot());
            // autoApprovalEnabled: 항상 업데이트 (null-safe, 기본 false)
            store.setAutoApprovalEnabled(Boolean.TRUE.equals(request.getAutoApprovalEnabled()));
            store.setBookingDeadlineHours(request.getBookingDeadlineHours());
            if (request.getPaymentTimeoutMinutes() != null) store.setPaymentTimeoutMinutes(request.getPaymentTimeoutMinutes());
            if (request.getReservationSlotMinutes() != null) store.setReservationSlotMinutes(request.getReservationSlotMinutes());
            if (request.getAllowLatePayment() != null) store.setAllowLatePayment(request.getAllowLatePayment());
            // allowDuplicateReservation: 항상 업데이트 (null-safe, 기본 false)
            store.setAllowDuplicateReservation(Boolean.TRUE.equals(request.getAllowDuplicateReservation()));
            // emailNotificationEnabled: null이면 변경 안 함
            if (request.getEmailNotificationEnabled() != null) store.setEmailNotificationEnabled(request.getEmailNotificationEnabled());
            if (request.getOpenTime() != null) store.setOpenTime(request.getOpenTime());
            if (request.getCloseTime() != null) store.setCloseTime(request.getCloseTime());
            // 브레이크 타임: null 전송 시 삭제, 값 있으면 업데이트
            store.setBreakStartTime(request.getBreakStartTime());
            store.setBreakEndTime(request.getBreakEndTime());
            if (request.getCloseTime() != null) store.setCloseTime(request.getCloseTime());

            if (request.getKeywords() != null) {
                store.setKeywordList(request.getKeywords());
            }

            // 메인 이미지 및 상세 이미지 처리 (기존 로직 유지)
            updateStoreImages(store, request);

            Store savedStore = storeRepository.save(store);
            log.info("Store updated: storeId={}", savedStore.getId());

            return StoreResponse.fromEntity(savedStore);
        } catch (Exception e) {
            log.error("Store update failed: storeId={}", id, e);
            throw e;
        }
    }

    /**
     * 자동 승인 토글 (PATCH 전용)
     */
    @Transactional
    public StoreResponse toggleAutoApproval(Long id, boolean enabled, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 수정할 권한이 없습니다.");
        }
        store.setAutoApprovalEnabled(enabled);
        return StoreResponse.fromEntity(storeRepository.save(store));
    }

    /**
     * 가게 삭제 전 활성 예약 수 조회 (삭제 확인 모달용)
     */
    @Transactional(readOnly = true)
    public int countActiveReservations(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 조회할 권한이 없습니다.");
        }
        return reservationRepository.countActiveReservationsByStoreId(id);
    }

    /**
     * 가게 삭제
     * @param force true면 활성 예약이 있어도 강제 삭제
     */
    @Transactional
    public void deleteStore(Long id, Member member, boolean force) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);

        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 삭제할 권한이 없습니다.");
        }

        // force=false면 활성 예약 있을 때 차단
        if (!force) {
            int activeCount = reservationRepository.countActiveReservationsByStoreId(id);
            if (activeCount > 0) {
                throw new StoreException(
                    "현재 진행 중인 예약이 " + activeCount + "건 있습니다. " +
                    "예약 내역을 함께 삭제하려면 '예약 포함 삭제'를 선택해주세요.",
                    HttpStatus.CONFLICT
                );
            }
        }

        log.info("Store deletion started: storeId={}, force={}", id, force);

        // 삭제 순서: Payment → Review → Reservation → Favorite → Promotion → Store
        // (Payment가 Reservation을 FK 참조하므로 Payment 먼저 삭제)
        paymentRepository.deleteByStoreId(id);
        reviewRepository.deleteByStoreId(id);
        reservationRepository.deleteByStoreId(id);
        favoriteRepository.deleteByStoreId(id);
        promotionRepository.deleteByStoreId(id);

        // 이미지 파일 삭제
        if (store.getMainImageUrl() != null) {
            fileStorageService.deleteFile(store.getMainImageUrl());
        }
        store.getDetailImageList().forEach(fileStorageService::deleteFile);

        storeRepository.delete(store);
        log.info("Store deleted: storeId={}", id);
    }

    /**
     * 이미지 업데이트 보조 메서드 (가독성을 위해 분리)
     */
    private void updateStoreImages(Store store, StoreUpdateRequest request) {
        Long memberId = store.getOwner().getId();
        Long storeId = store.getId();

        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            if (store.getMainImageUrl() != null) {
                fileStorageService.deleteFile(store.getMainImageUrl());
            }
            String key = fileStorageService.storeFile(
                    request.getMainImage(), FileStoragePaths.storeThumbnail(memberId, storeId));
            store.setMainImageUrl(fileStorageService.getPublicUrl(key));
        } else if (request.getExistingMainImageUrl() != null) {
            store.setMainImageUrl(request.getExistingMainImageUrl());
        }

        List<String> finalDetailImages = new ArrayList<>();
        if (request.getExistingDetailImageUrls() != null) {
            finalDetailImages.addAll(request.getExistingDetailImageUrls());
        }

        if (request.getDetailImages() != null) {
            for (MultipartFile file : request.getDetailImages()) {
                if (file != null && !file.isEmpty()) {
                    String key = fileStorageService.storeFile(
                            file, FileStoragePaths.storeImage(memberId, storeId));
                    finalDetailImages.add(fileStorageService.getPublicUrl(key));
                }
            }
        }

        // 삭제된 파일 처리
        List<String> currentDetailImages = store.getDetailImageList();
        if (currentDetailImages != null) {
            for (String existingUrl : currentDetailImages) {
                if (!finalDetailImages.contains(existingUrl)) {
                    fileStorageService.deleteFile(existingUrl);
                }
            }
        }
        store.setDetailImageList(finalDetailImages);
    }

    /**
     * 키워드로 가게 검색 및 정렬 (기존 유지)
     */
    /** 가게 목록 조회 — 페이지네이션 지원 */
    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(String keyword, String sort, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        if (keyword == null || keyword.trim().isEmpty()) {
            Page<Store> storePage = getAllStoresSortedPaged(sort, pageable);
            return storePage.map(StoreResponse::fromEntity);
        } else {
            Page<Store> storePage = storeRepository.searchStoresPaged(keyword.trim(), pageable);
            // 인메모리 정렬 (키워드 검색 + 정렬 조합)
            List<Store> sorted = sortStores(storePage.getContent(), sort);
            return new PageImpl<>(
                sorted.stream().map(StoreResponse::fromEntity).collect(Collectors.toList()),
                pageable,
                storePage.getTotalElements()
            );
        }
    }

    private Page<Store> getAllStoresSortedPaged(String sort, Pageable pageable) {
        if (sort == null) sort = "rating";
        // 공개 목록에서는 소프트 삭제 + 제재(정지/영구정지) 가게를 제외
        return switch (sort) {
            case "recent"  -> storeRepository.findByDeletedAtIsNullAndStatusOrderByCreatedAtDesc(StoreStatus.ACTIVE, pageable);
            case "reviews" -> storeRepository.findByDeletedAtIsNullAndStatusOrderByReviewCountDesc(StoreStatus.ACTIVE, pageable);
            default        -> storeRepository.findByDeletedAtIsNullAndStatusOrderByRatingDesc(StoreStatus.ACTIVE, pageable);
        };
    }

    /** 하위 호환용 — 기존 전체 조회 (내부 로직용) */
    @Transactional(readOnly = true)
    public List<StoreResponse> searchStores(String keyword, String sort) {
        List<Store> stores;
        if (keyword == null || keyword.trim().isEmpty()) {
            stores = getAllStoresSorted(sort);
        } else {
            stores = storeRepository.searchStores(keyword.trim());
            stores = sortStores(stores, sort);
        }
        return stores.stream().map(StoreResponse::fromEntity).collect(Collectors.toList());
    }

    private List<Store> getAllStoresSorted(String sort) {
        if (sort == null) sort = "rating";
        return switch (sort) {
            case "recent" -> storeRepository.findAllByOrderByCreatedAtDesc();
            case "reviews" -> storeRepository.findAllByOrderByReviewCountDesc();
            default -> storeRepository.findAllByOrderByRatingDesc();
        };
    }

    private List<Store> sortStores(List<Store> stores, String sort) {
        if (sort == null) sort = "rating";
        return switch (sort) {
            case "recent" -> stores.stream().sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt())).collect(Collectors.toList());
            case "reviews" -> stores.stream().sorted((a, b) -> Integer.compare(b.getReviewCount(), a.getReviewCount())).collect(Collectors.toList());
            default -> stores.stream().sorted((a, b) -> Double.compare(b.getRating() != null ? b.getRating() : 0.0, a.getRating() != null ? a.getRating() : 0.0)).collect(Collectors.toList());
        };
    }
}