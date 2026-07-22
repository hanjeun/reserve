package kr.it.reserve.store.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.dto.StoreStatisticsResponse;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
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
    private final AdvertisementRepository advertisementRepository;
    private final ObjectMapper objectMapper;
    // 이름을 "imageUploadExecutor"로 맞춰서 AsyncConfig의 @Bean(name = "imageUploadExecutor")와
    // 매칭시킴 — Lombok의 @RequiredArgsConstructor는 @Qualifier를 생성자로 복사해주지 않아서
    // (IDE 경고 확인함), 대신 Spring의 "타입이 여러 개면 파라미터명=빈이름으로 매칭" 폴백에 의존.
    private final Executor imageUploadExecutor;

    // 상세 이미지 하나의 원본 크기 — detailImagesMeta JSON 배열의 각 원소
    private record ImageDimension(Integer width, Integer height) {}

    private List<ImageDimension> parseDetailImagesMeta(String json) {
        if (json == null || json.trim().isEmpty()) return new ArrayList<>();
        try {
            return objectMapper.readValue(json, new TypeReference<List<ImageDimension>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse detailImagesMeta, treating as empty: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private String toDetailImagesMetaJson(List<ImageDimension> list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("Failed to serialize detailImagesMeta: {}", e.getMessage());
            return null;
        }
    }

    private ImageDimension readImageDimension(MultipartFile file) {
        int[] dim = fileStorageService.readImageDimensions(file);
        return dim != null ? new ImageDimension(dim[0], dim[1]) : new ImageDimension(null, null);
    }

    // 상세 이미지 하나 업로드 결과(URL + 원본 크기) — 병렬 업로드 후에도 입력 순서와 1:1 대응 유지
    private record UploadedDetailImage(String url, ImageDimension dim) {}

    /**
     * 상세 이미지 여러 장을 병렬로 S3 업로드(2026-07 추가 — "이미지 업로드 비동기 병렬 처리" 블로그 글 참고).
     * 기존엔 파일 개수만큼 순차 블로킹 업로드라 이미지가 많을수록 응답이 선형으로 느려졌음 —
     * CompletableFuture.supplyAsync로 동시에 여러 장을 올림. join은 입력 리스트 순서 그대로
     * 수행하므로(완료 순서가 아니라), detailImages와 detailImagesMeta의 1:1 순서 대응이 그대로 유지됨.
     * 트랜잭션 내부에서 동기적으로 join하므로(응답을 먼저 반환하는 방식이 아님) Store 등록/수정
     * 트랜잭션의 원자성은 그대로 유지되고, 이미지 하나라도 업로드 실패하면 예외가 전파되어 롤백된다.
     */
    private List<UploadedDetailImage> uploadDetailImagesParallel(List<MultipartFile> files, Long memberId, Long storeId) {
        List<CompletableFuture<UploadedDetailImage>> futures = files.stream()
                .filter(f -> f != null && !f.isEmpty())
                .map(f -> CompletableFuture.supplyAsync(() -> {
                    String key = fileStorageService.storeFile(f, FileStoragePaths.storeImage(memberId, storeId));
                    String url = fileStorageService.getPublicUrl(key);
                    return new UploadedDetailImage(url, readImageDimension(f));
                }, imageUploadExecutor))
                .toList();
        return futures.stream()
                .map(future -> {
                    try {
                        return future.join();
                    } catch (CompletionException e) {
                        // storeFile()이 던지는 FileException 등 원래 예외 타입을 그대로 보존 — CompletionException으로
                        // 감싸인 채로 전파되면 전역 예외 핸들러(@ExceptionHandler)가 원래 타입으로 못 잡을 수 있음
                        if (e.getCause() instanceof RuntimeException re) throw re;
                        throw e;
                    }
                })
                .toList();
    }

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
                .nearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()))
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
            int[] dim = fileStorageService.readImageDimensions(request.getMainImage());
            if (dim != null) {
                savedStore.setMainImageWidth(dim[0]);
                savedStore.setMainImageHeight(dim[1]);
            }
        }

        List<String> detailImageUrls = new ArrayList<>();
        List<ImageDimension> detailImageDims = new ArrayList<>();
        if (request.getDetailImages() != null && !request.getDetailImages().isEmpty()) {
            for (UploadedDetailImage r : uploadDetailImagesParallel(request.getDetailImages(), memberId, storeId)) {
                detailImageUrls.add(r.url());
                detailImageDims.add(r.dim());
            }
        }

        if (!detailImageUrls.isEmpty()) {
            savedStore.setDetailImageList(detailImageUrls);
            savedStore.setDetailImagesMeta(toDetailImagesMetaJson(detailImageDims));
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
            if (request.getNearbyRadiusKm() != null) store.setNearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()));
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
     * 사업자 "통계 · 분석" 탭 — 기간(range: 7d/30d/90d) 동안의 예약 추이/상태 분포/매출 추이 + 평점 + 광고 현황.
     * 관리자 대시보드(DashboardTab)와 달리 가게별로 오래 쌓이는 데이터라서, 프론트에서 100건 뒤지는 대신
     * DB에서 GROUP BY로 직접 집계해서 내려준다.
     */
    @Transactional(readOnly = true)
    public StoreStatisticsResponse getStoreStatistics(Long storeId, Member member, String range) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(StoreException::notFound);
        boolean isAdmin = member.isAdmin();
        boolean isOwner = store.getOwner() != null && store.getOwner().getId().equals(member.getId());
        if (!isAdmin && !isOwner) {
            throw StoreException.forbidden("통계를 조회할 권한이 없습니다.");
        }

        int days = switch (range == null ? "30d" : range) {
            case "7d" -> 7;
            case "90d" -> 90;
            default -> 30;
        };
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(days - 1L);

        // 예약 추이 — 데이터 없는 날짜도 0건으로 빈칸 없이 채운다(차트가 중간에 끓기지 않게)
        Map<LocalDate, Long> countMap = new HashMap<>();
        for (Object[] row : reservationRepository.countGroupedByDate(storeId, start, end)) {
            countMap.put((LocalDate) row[0], (Long) row[1]);
        }
        List<StoreStatisticsResponse.DailyValue> reservationTrend = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            reservationTrend.add(StoreStatisticsResponse.DailyValue.builder()
                    .date(d.toString()).value(countMap.getOrDefault(d, 0L)).build());
        }

        // 상태별 분포
        Map<String, Long> statusBreakdown = new LinkedHashMap<>();
        for (Object[] row : reservationRepository.countGroupedByStatus(storeId, start, end)) {
            statusBreakdown.put(row[0].toString(), (Long) row[1]);
        }

        // 예약금 매출 추이 (결제 완료건만)
        Map<LocalDate, Long> revenueMap = new HashMap<>();
        for (Object[] row : reservationRepository.sumDepositGroupedByDate(storeId, start, end)) {
            revenueMap.put((LocalDate) row[0], row[1] != null ? ((Number) row[1]).longValue() : 0L);
        }
        List<StoreStatisticsResponse.DailyValue> revenueTrend = new ArrayList<>();
        long totalRevenue = 0L;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            long v = revenueMap.getOrDefault(d, 0L);
            totalRevenue += v;
            revenueTrend.add(StoreStatisticsResponse.DailyValue.builder().date(d.toString()).value(v).build());
        }

        // 현재 활성 광고 요약 (없으면 null)
        StoreStatisticsResponse.AdSummary adSummary = advertisementRepository
                .findFirstByStoreIdAndStatusOrderByEndDateDesc(storeId, AdStatus.ACTIVE)
                .map(ad -> StoreStatisticsResponse.AdSummary.builder()
                        .adType(ad.getAdType().name())
                        .status(ad.getStatus().name())
                        .daysRemaining((int) ChronoUnit.DAYS.between(LocalDate.now(), ad.getEndDate()))
                        .impressionCount(ad.getImpressionCount())
                        .clickCount(ad.getClickCount())
                        .conversionCount(ad.getConversionCount())
                        .clickThroughRate(ad.getClickThroughRate())
                        .conversionRate(ad.getConversionRate())
                        .build())
                .orElse(null);

        return StoreStatisticsResponse.builder()
                .reservationTrend(reservationTrend)
                .statusBreakdown(statusBreakdown)
                .averageRating(store.getRating())
                .reviewCount(store.getReviewCount())
                .revenueTrend(revenueTrend)
                .totalDepositRevenue(totalRevenue)
                .adSummary(adSummary)
                .build();
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
            int[] dim = fileStorageService.readImageDimensions(request.getMainImage());
            store.setMainImageWidth(dim != null ? dim[0] : null);
            store.setMainImageHeight(dim != null ? dim[1] : null);
        } else if (request.getExistingMainImageUrl() != null) {
            store.setMainImageUrl(request.getExistingMainImageUrl());
            // 기존 이미지를 그대로 유지하는 경우에는 width/height도 이미 저장된 값 그대로 유지된다(건드리지 않음)
        }

        // 상세 이미지: 이전 URL → 이전 크기 매핑을 미리 구성해둔다(순서가 바뀌어도 URL 기준으로 찾음)
        List<String> oldUrls = store.getDetailImageList();
        List<ImageDimension> oldDims = parseDetailImagesMeta(store.getDetailImagesMeta());
        Map<String, ImageDimension> urlToDim = new HashMap<>();
        for (int i = 0; i < oldUrls.size() && i < oldDims.size(); i++) {
            urlToDim.put(oldUrls.get(i), oldDims.get(i));
        }

        List<String> finalDetailImages = new ArrayList<>();
        List<ImageDimension> finalDetailDims = new ArrayList<>();
        if (request.getExistingDetailImageUrls() != null) {
            for (String url : request.getExistingDetailImageUrls()) {
                finalDetailImages.add(url);
                finalDetailDims.add(urlToDim.getOrDefault(url, new ImageDimension(null, null)));
            }
        }

        if (request.getDetailImages() != null) {
            for (UploadedDetailImage r : uploadDetailImagesParallel(request.getDetailImages(), memberId, storeId)) {
                finalDetailImages.add(r.url());
                finalDetailDims.add(r.dim());
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
        store.setDetailImagesMeta(toDetailImagesMetaJson(finalDetailDims));
    }

    /**
     * "우리동네" 배지 기준 거리(km) 검증 — 사장님이 직접 입력하지만 1~10km 범위로 강제 클램프.
     * null이면 기본값(3km). 0은 "배지 끄기"를 의미하는 설정값이라 클램프하지 않고 그대로 통과시킴
     * (프론트 isNearby()가 radiusKm<=0을 "항상 미표시"로 해석).
     */
    private static final int MIN_NEARBY_RADIUS_KM = 1;
    private static final int MAX_NEARBY_RADIUS_KM = 10;
    private static final int DEFAULT_NEARBY_RADIUS_KM = 3;
    private static final int NEARBY_RADIUS_DISABLED = 0;

    private Integer clampNearbyRadiusKm(Integer km) {
        if (km == null) return DEFAULT_NEARBY_RADIUS_KM;
        if (km == NEARBY_RADIUS_DISABLED) return NEARBY_RADIUS_DISABLED;
        if (km < MIN_NEARBY_RADIUS_KM) return MIN_NEARBY_RADIUS_KM;
        if (km > MAX_NEARBY_RADIUS_KM) return MAX_NEARBY_RADIUS_KM;
        return km;
    }

    /**
     * 키워드로 가게 검색 및 정렬 (기존 유지)
     */
    /** 가게 목록 조회 — 페이지네이션 지원 */
    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(String keyword, String sort, int page, int size, Double lat, Double lng) {
        Pageable pageable = PageRequest.of(page, size);
        if (keyword == null || keyword.trim().isEmpty()) {
            Page<Store> storePage = getAllStoresSortedPaged(sort, pageable, lat, lng);
            return storePage.map(StoreResponse::fromEntity);
        } else {
            Page<Store> storePage = storeRepository.searchStoresPaged(keyword.trim(), pageable);
            // 인메모리 정렬 (키워드 검색 + 정렬 조합)
            List<Store> sorted = sortStores(storePage.getContent(), sort, lat, lng);
            return new PageImpl<>(
                sorted.stream().map(StoreResponse::fromEntity).collect(Collectors.toList()),
                pageable,
                storePage.getTotalElements()
            );
        }
    }

    private Page<Store> getAllStoresSortedPaged(String sort, Pageable pageable, Double lat, Double lng) {
        if (sort == null) sort = "rating";
        // "distance": 좌표 없으면 rating으로 fallback (굴직하게 복귀)
        if ("distance".equals(sort) && lat != null && lng != null) {
            List<Store> all = storeRepository.findByDeletedAtIsNullAndStatus(StoreStatus.ACTIVE);
            List<Store> sorted = sortByDistance(all, lat, lng);
            return paginate(sorted, pageable);
        }
        // 공개 목록에서는 소프트 삭제 + 제재(정지/영구정지) 가게를 제외
        return switch (sort) {
            case "recent"  -> storeRepository.findByDeletedAtIsNullAndStatusOrderByCreatedAtDesc(StoreStatus.ACTIVE, pageable);
            case "reviews" -> storeRepository.findByDeletedAtIsNullAndStatusOrderByReviewCountDesc(StoreStatus.ACTIVE, pageable);
            default        -> storeRepository.findByDeletedAtIsNullAndStatusOrderByRatingDesc(StoreStatus.ACTIVE, pageable);
        };
    }

    /** 이미 정렬된 리스트를 Pageable 기준으로 수동 페이지네이션 (native Haversine 미사용 대안) */
    private Page<Store> paginate(List<Store> sorted, Pageable pageable) {
        int start = (int) pageable.getOffset();
        if (start >= sorted.size()) return new PageImpl<>(List.of(), pageable, sorted.size());
        int end = Math.min(start + pageable.getPageSize(), sorted.size());
        return new PageImpl<>(sorted.subList(start, end), pageable, sorted.size());
    }

    /** 하버사인(Haversine) 공식으로 거리순 정렬 — 좌표 없는 가게는 맨 뒤로 (제외하지 않고 노출만 뒤로 미룸) */
    private List<Store> sortByDistance(List<Store> stores, double lat, double lng) {
        return stores.stream()
                .sorted((a, b) -> {
                    Double da = distanceKm(lat, lng, a.getLatitude(), a.getLongitude());
                    Double db = distanceKm(lat, lng, b.getLatitude(), b.getLongitude());
                    if (da == null && db == null) return 0;
                    if (da == null) return 1;   // a: 좌표 없음 → 뒤로
                    if (db == null) return -1;  // b: 좌표 없음 → a가 앞으로
                    return Double.compare(da, db);
                })
                .collect(Collectors.toList());
    }

    /** 두 좌표 간 거리(km). 둘 중 하나라도 좌표가 없으면 null 반환 */
    private static Double distanceKm(double lat1, double lng1, Double lat2, Double lng2) {
        if (lat2 == null || lng2 == null) return null;
        final double EARTH_RADIUS_KM = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    /** 하위 호환용 — 기존 전체 조회 (내부 로직용) */
    @Transactional(readOnly = true)
    public List<StoreResponse> searchStores(String keyword, String sort) {
        List<Store> stores;
        if (keyword == null || keyword.trim().isEmpty()) {
            stores = getAllStoresSorted(sort);
        } else {
            stores = storeRepository.searchStores(keyword.trim());
            stores = sortStores(stores, sort, null, null);
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

    private List<Store> sortStores(List<Store> stores, String sort, Double lat, Double lng) {
        if (sort == null) sort = "rating";
        if ("distance".equals(sort) && lat != null && lng != null) {
            return sortByDistance(stores, lat, lng);
        }
        return switch (sort) {
            case "recent" -> stores.stream().sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt())).collect(Collectors.toList());
            case "reviews" -> stores.stream().sorted((a, b) -> Integer.compare(b.getReviewCount(), a.getReviewCount())).collect(Collectors.toList());
            default -> stores.stream().sorted((a, b) -> Double.compare(b.getRating() != null ? b.getRating() : 0.0, a.getRating() != null ? a.getRating() : 0.0)).collect(Collectors.toList());
        };
    }
}