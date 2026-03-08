package com.reserve.store.service;

import com.reserve.favorite.repository.FavoriteRepository;
import com.reserve.global.error.StoreException;
import com.reserve.member.entity.Member;
import com.reserve.promotion.repository.PromotionRepository;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.repository.StoreRepository;
import com.reserve.store.dto.StoreCreateRequest;
import com.reserve.store.dto.StoreResponse;
import com.reserve.store.dto.StoreUpdateRequest;
import com.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

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

    /**
     * 가게 등록
     */
    @Transactional
    public StoreResponse createStore(StoreCreateRequest request, Member owner) {

        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new StoreException("가게 이름은 필수입니다.", HttpStatus.BAD_REQUEST);
        }

        // 메인 이미지 저장
        String mainImageUrl = null;
        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            mainImageUrl = fileStorageService.storeFile(request.getMainImage());
        }

        // 상세 이미지들 저장
        List<String> detailImageUrls = new ArrayList<>();
        if (request.getDetailImages() != null && !request.getDetailImages().isEmpty()) {
            for (MultipartFile file : request.getDetailImages()) {
                if (file != null && !file.isEmpty()) {
                    detailImageUrls.add(fileStorageService.storeFile(file));
                }
            }
        }

        Store store = Store.builder()
                .owner(owner)
                .name(request.getName().trim())
                .description(request.getDescription())
                .address(request.getAddress())
                .phone(request.getPhone())
                .category(request.getCategory())
                .mainImageUrl(mainImageUrl)
                .rating(0.0)
                .reviewCount(0)
                .noShowDeposit(request.getNoShowDeposit() != null ? request.getNoShowDeposit() : 0)
                .fullRefundDays(request.getFullRefundDays() != null ? request.getFullRefundDays() : 3)
                .partialRefundDays(request.getPartialRefundDays() != null ? request.getPartialRefundDays() : 1)
                .partialRefundRate(request.getPartialRefundRate() != null ? request.getPartialRefundRate() : 50)
                .maxCapacityPerSlot(request.getMaxCapacityPerSlot())  // null = 무제한
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

        if (!detailImageUrls.isEmpty()) {
            store.setDetailImageList(detailImageUrls);
        }

        if (request.getOpenTime() != null && request.getCloseTime() != null) {
            store.setOpenTime(request.getOpenTime());
            store.setCloseTime(request.getCloseTime());
        }

        Store savedStore = storeRepository.save(store);
        log.info("가게 등록 완료: ID={}", savedStore.getId());

        return StoreResponse.fromEntity(savedStore);
    }

    /**
     * 내가 등록한 가게 목록 조회
     */
    @Transactional(readOnly = true)
    public List<StoreResponse> getMyStores(Member member) {
        List<Store> stores = storeRepository.findByOwnerOrderByCreatedAtDesc(member);
        return stores.stream()
                .map(StoreResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /**
     * 가게 상세 조회
     */
    @Transactional(readOnly = true)
    public StoreResponse getStore(Long id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        return StoreResponse.fromEntity(store);
    }

    /**
     * 가게 수정
     */
    @Transactional
    public StoreResponse updateStore(Long id, StoreUpdateRequest request, Member member) {
        log.info("StoreService.updateStore 시작: storeId={}", id);

        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);

        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            log.error("권한 없음: storeOwnerId={}, requestMemberId={}", store.getOwner().getId(), member.getId());
            throw StoreException.forbidden("가게를 수정할 권한이 없습니다.");
        }

        try {
            if (request.getName() != null) store.setName(request.getName());
            if (request.getDescription() != null) store.setDescription(request.getDescription());
            if (request.getAddress() != null) store.setAddress(request.getAddress());
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

            if (request.getKeywords() != null) {
                store.setKeywordList(request.getKeywords());
            }

            // 메인 이미지 및 상세 이미지 처리 (기존 로직 유지)
            updateStoreImages(store, request);

            Store savedStore = storeRepository.save(store);
            log.info("가게 수정 완료: storeId={}", savedStore.getId());

            return StoreResponse.fromEntity(savedStore);
        } catch (Exception e) {
            log.error("가게 수정 중 예외 발생: storeId={}", id, e);
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
     * 가게 삭제
     */
    @Transactional
    public void deleteStore(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);

        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 삭제할 권한이 없습니다.");
        }

        log.info("가게 삭제 시작: storeId={}", id);

        // 관련 데이터 삭제
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
        log.info("가게 삭제 완료: storeId={}", id);
    }

    /**
     * 이미지 업데이트 보조 메서드 (가독성을 위해 분리)
     */
    private void updateStoreImages(Store store, StoreUpdateRequest request) {
        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            if (store.getMainImageUrl() != null) {
                fileStorageService.deleteFile(store.getMainImageUrl());
            }
            store.setMainImageUrl(fileStorageService.storeFile(request.getMainImage()));
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
                    finalDetailImages.add(fileStorageService.storeFile(file));
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