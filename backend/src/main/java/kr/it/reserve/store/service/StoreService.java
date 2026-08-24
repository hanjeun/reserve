package kr.it.reserve.store.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.common.ServiceTime;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalTime;
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

    /**
     * 가게 검색에 MySQL FULLTEXT(ngram)를 쓸지 여부.
     *
     * <p>prod에서만 true다. 테스트는 H2로 돌고 H2에는 {@code MATCH ... AGAINST}가 없어서,
     * 무조건 켜면 CI가 깨진다. local도 개발용 MySQL에 FULLTEXT 인덱스를 만들어 두지 않았으면
     * 에러가 나므로 기본값을 false로 둔다.
     *
     * <p>★ 이 필드는 <b>final이 아니어야 한다.</b> 이 클래스는 Lombok {@code @RequiredArgsConstructor}를
     * 쓰는데, final 필드는 생성자 파라미터가 되고 그때 {@code @Value}는 (copyableAnnotations 설정 없이는)
     * 생성자로 복사되지 않아 주입이 안 된다. non-final이면 필드 주입 경로를 탄다.
     *
     * <p>선행 조건: {@code docs/technical/manual-ddl.md}의 FULLTEXT 인덱스 DDL 적용.
     */
    @Value("${search.store.fulltext-enabled:false}")
    private boolean fulltextEnabled;

    /** ngram 파서의 최소 토큰 길이. 이보다 짧은 검색어는 FULLTEXT로 잡히지 않아 LIKE로 폴백한다. */
    private static final int NGRAM_TOKEN_SIZE = 2;
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
                // 옵션 값은 전부 clamp/normalize 를 거친다 — 아래 "가게 옵션 정규화" 절 참고.
                .noShowDeposit(clampDeposit(request.getNoShowDeposit()))
                .fullRefundDays(clampFullRefundDays(request.getFullRefundDays()))
                .partialRefundDays(clampPartialRefundDays(
                        request.getPartialRefundDays(), clampFullRefundDays(request.getFullRefundDays())))
                .partialRefundRate(clampPartialRefundRate(request.getPartialRefundRate()))
                .maxCapacityPerSlot(normalizeCapacity(request.getMaxCapacityPerSlot()))
                .autoApprovalEnabled(request.getAutoApprovalEnabled() != null ? request.getAutoApprovalEnabled() : false)
                .bookingDeadlineHours(clampBookingDeadlineHours(request.getBookingDeadlineHours()))
                .paymentTimeoutMinutes(clampPaymentTimeout(request.getPaymentTimeoutMinutes()))
                .reservationSlotMinutes(clampSlotMinutes(request.getReservationSlotMinutes()))
                .nearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()))
                .allowLatePayment(request.getAllowLatePayment() != null ? request.getAllowLatePayment() : false)
                .allowDuplicateReservation(request.getAllowDuplicateReservation() != null ? request.getAllowDuplicateReservation() : false)
                .emailNotificationEnabled(request.getEmailNotificationEnabled() != null ? request.getEmailNotificationEnabled() : true)
                .maxAdvanceBookingDays(clampMaxAdvanceBookingDays(request.getMaxAdvanceBookingDays()))
                .build();

        store.setClosedDayList(normalizeClosedDays(request.getClosedDays()));
        store.setClosedDateList(normalizeClosedDates(request.getClosedDates()));
        applyOperatingPeriod(store, request.getOpenDate(), request.getCloseDate());
        applyBookingType(store, request.getBookingType(), request.getSessionTimes());

        if (request.getKeywords() != null && !request.getKeywords().isEmpty()) {
            store.setKeywordList(request.getKeywords());
        }

        if (request.getOpenTime() != null && request.getCloseTime() != null) {
            store.setOpenTime(request.getOpenTime());
            store.setCloseTime(request.getCloseTime());
        }
        // ★ 브레이크타임은 영업시간 if 블록 **밖**에 둔다.
        //   예전엔 안에 있어서 영업시간 없이 브레이크타임만 보내면 조용히 버려졌고,
        //   수정 경로(updateStore)는 블록 밖이라 **생성과 수정의 동작이 달랐다**.
        store.setBreakStartTime(request.getBreakStartTime());
        store.setBreakEndTime(request.getBreakEndTime());
        // ★ 저장 직전에 "최종 값"으로 검증한다 — 요청 본문이 아니라 엔티티를 본다.
        //   요청만 보면 생성/수정 경로가 서로 다른 판정을 하게 된다(수정은 일부 필드만 올 수 있다).
        validateBusinessHours(store);

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
            // 옵션 값은 전부 clamp/normalize 를 거친다(생성 경로와 동일) — "가게 옵션 정규화" 절 참고.
            if (request.getNoShowDeposit() != null) store.setNoShowDeposit(clampDeposit(request.getNoShowDeposit()));
            if (request.getFullRefundDays() != null) store.setFullRefundDays(clampFullRefundDays(request.getFullRefundDays()));
            if (request.getPartialRefundDays() != null) {
                // 비교 기준은 "이번 요청의 fullDays"가 아니라 **최종 저장될 fullDays** 여야 한다.
                // 전액 기준일을 안 보낸 부분 수정 요청이면 기존 값과 비교해야 구간이 맞는지 판단된다.
                store.setPartialRefundDays(clampPartialRefundDays(
                        request.getPartialRefundDays(), store.getFullRefundDays()));
            }
            if (request.getPartialRefundRate() != null) store.setPartialRefundRate(clampPartialRefundRate(request.getPartialRefundRate()));
            // maxCapacityPerSlot: 항상 업데이트 (null = 무제한, 프론트가 명시적으로 보냄)
            store.setMaxCapacityPerSlot(normalizeCapacity(request.getMaxCapacityPerSlot()));
            // autoApprovalEnabled: 항상 업데이트 (null-safe, 기본 false)
            store.setAutoApprovalEnabled(Boolean.TRUE.equals(request.getAutoApprovalEnabled()));
            store.setBookingDeadlineHours(clampBookingDeadlineHours(request.getBookingDeadlineHours()));
            if (request.getPaymentTimeoutMinutes() != null) store.setPaymentTimeoutMinutes(clampPaymentTimeout(request.getPaymentTimeoutMinutes()));
            if (request.getReservationSlotMinutes() != null) store.setReservationSlotMinutes(clampSlotMinutes(request.getReservationSlotMinutes()));
            if (request.getNearbyRadiusKm() != null) store.setNearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()));
            if (request.getAllowLatePayment() != null) store.setAllowLatePayment(request.getAllowLatePayment());
            // allowDuplicateReservation: 항상 업데이트 (null-safe, 기본 false)
            store.setAllowDuplicateReservation(Boolean.TRUE.equals(request.getAllowDuplicateReservation()));
            // emailNotificationEnabled: null이면 변경 안 함
            if (request.getEmailNotificationEnabled() != null) store.setEmailNotificationEnabled(request.getEmailNotificationEnabled());
            // 휴무는 "항상 덮어쓴다" — 요일·날짜를 **빼는** 것도 정상적인 수정이라
            // null 가드를 두면 마지막 휴무를 지울 방법이 없어진다.
            store.setClosedDayList(normalizeClosedDays(request.getClosedDays()));
            store.setClosedDateList(normalizeClosedDates(request.getClosedDates()));
            // 휴무와 같은 이유로 항상 덮어쓴다 — 운영 기간을 **없애는** 것도 정상적인 수정이라
            // null 가드를 두면 한 번 넣은 기간을 지울 방법이 사라진다.
            applyOperatingPeriod(store, request.getOpenDate(), request.getCloseDate());
            applyBookingType(store, request.getBookingType(), request.getSessionTimes());
            store.setMaxAdvanceBookingDays(clampMaxAdvanceBookingDays(request.getMaxAdvanceBookingDays()));
            if (request.getOpenTime() != null) store.setOpenTime(request.getOpenTime());
            if (request.getCloseTime() != null) store.setCloseTime(request.getCloseTime());
            // 브레이크 타임: null 전송 시 삭제, 값 있으면 업데이트
            store.setBreakStartTime(request.getBreakStartTime());
            store.setBreakEndTime(request.getBreakEndTime());
            // (2026-08-09) 여기 있던 setCloseTime 중복 호출을 제거했다 — 위에서 이미 같은 값을 넣는다.
            // ★ 병합이 끝난 뒤 검증한다. 요청에 openTime 만 왔다면 기존 closeTime 과 비교돼야 한다 —
            //   요청 본문끼리만 비교하면 "12시 오픈만 보냈는데 마감이 10시인 가게"를 통과시킨다.
            validateBusinessHours(store);

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
        LocalDate end = ServiceTime.today();
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
                        .daysRemaining((int) ChronoUnit.DAYS.between(ServiceTime.today(), ad.getEndDate()))
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
     * 운영 기간(openDate~closeDate)을 정규화해 저장한다 (2026-08-24 신설).
     *
     * <p><b>지난 날짜를 걸러내지 않는다</b> — {@code closedDates} 는 걸러내지만 여기는 다르다.
     * 임시 휴무는 계속 쌓이기만 하는 목록이라 정리가 필요하지만, 운영 기간은 값 하나이고
     * <b>이미 끝난 팝업스토어</b>도 정상적인 상태다. 걸러내면 종료된 가게가 갑자기 무기한 영업이 된다.
     *
     * <p>형식이 깨진 값은 {@code null}(제한 없음)로 흡수한다 — 저장을 통째로 실패시킬 사안이 아니고,
     * 이 화면은 날짜 선택기를 쓰므로 정상 조작으로는 깨진 값이 나오지 않는다.
     *
     * <p>종료일이 시작일보다 앞이면 <b>거절한다.</b> 그 조합은 "예약을 받을 수 있는 날이 하루도 없는
     * 가게"가 되는데, 영업시간 뒤집힘과 같은 종류의 조용한 고장이다.
     */
    private void applyOperatingPeriod(Store store, String rawOpen, String rawClose) {
        LocalDate open  = parseIsoDateOrNull(rawOpen);
        LocalDate close = parseIsoDateOrNull(rawClose);

        if (open != null && close != null && close.isBefore(open)) {
            throw new StoreException(
                    "운영 종료일은 시작일보다 뒤여야 합니다.", HttpStatus.BAD_REQUEST);
        }
        store.setOpenDate(open);
        store.setCloseDate(close);
    }

    /** 형식이 깨졌거나 비어 있으면 {@code null}. 호출측에서 "제한 없음"으로 읽힌다. */
    private LocalDate parseIsoDateOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 예약 방식과 회차 목록을 정규화해 저장한다 (2026-08-24 신설).
     *
     * <p><b>모르는 값은 거절하지 않고 {@code SLOT} 으로 흡수한다.</b> 이 값이 잘못 오면
     * 가게가 예약을 못 받는 상태가 되는데, 그건 400 을 돌려주는 것보다 훨씬 나쁘다.
     * 옛 클라이언트가 이 필드를 아예 안 보내는 경우도 같은 경로로 흘러간다.
     *
     * <p><b>SESSION 인데 회차가 하나도 없으면 거절한다.</b> 그 상태로 저장하면
     * 예약 가능한 시각이 0개인 가게가 조용히 만들어진다 — 영업시간 뒤집힘과 같은 종류다.
     *
     * <p>회차 목록은 <b>방식과 무관하게 항상 덮어쓴다.</b> SLOT 으로 되돌릴 때 옛 회차가 남아 있으면,
     * 나중에 다시 SESSION 으로 바꿨을 때 기억나지 않는 값이 되살아난다.
     */
    private void applyBookingType(Store store, String rawType, List<String> rawSessions) {
        Store.BookingType type = parseBookingType(rawType);
        List<LocalTime> sessions = normalizeSessionTimes(rawSessions);

        if (type == Store.BookingType.SESSION && sessions.isEmpty()) {
            throw new StoreException(
                    "회차제로 받으려면 회차 시각을 하나 이상 등록해주세요.", HttpStatus.BAD_REQUEST);
        }

        store.setBookingType(type);
        // SESSION 이 아니면 비운다 — 남겨두면 방식을 오갈 때 옛 값이 되살아난다.
        store.setSessionTimeList(type == Store.BookingType.SESSION ? sessions : List.of());
    }

    /** 모르는 값·빈 값은 전부 SLOT. 대소문자는 흡수한다. */
    private Store.BookingType parseBookingType(String raw) {
        if (raw == null || raw.isBlank()) return Store.BookingType.SLOT;
        try {
            return Store.BookingType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            log.warn("Unknown bookingType '{}' - falling back to SLOT", raw);
            return Store.BookingType.SLOT;
        }
    }

    /**
     * 회차 시각 정규화 — 형식이 깨진 값은 버리고, 중복을 없애고, 정렬한다.
     * 상한 {@value #MAX_SESSION_TIMES} 개 — 그 이상은 SLOT 방식으로 다뤄야 할 규모다.
     */
    private List<LocalTime> normalizeSessionTimes(List<String> raw) {
        if (raw == null) return List.of();
        List<LocalTime> out = new ArrayList<>();
        for (String v : raw) {
            if (v == null || v.isBlank()) continue;
            try {
                LocalTime t = LocalTime.parse(v.trim());
                if (!out.contains(t)) out.add(t);
            } catch (Exception ignored) {
                // 형식이 깨진 값은 조용히 버린다 — 저장을 통째로 실패시킬 사안이 아니다.
                // 전부 깨졌다면 위 applyBookingType 의 "회차 0개" 검사가 잡아준다.
            }
        }
        return out.stream().sorted().limit(MAX_SESSION_TIMES).toList();
    }

    // ══ 영업시간 정합성 (2026-08-24 신설) ══════════════════════════════════
    //
    // ★ 왜 clamp 가 아니라 거절인가 — 다른 옵션들은 "이상한 값이 오면 안전한 값으로 수렴"시킨다.
    //   숫자 하나는 무엇으로 고쳐야 할지가 자명하기 때문이다(음수 정원 → 무제한 등).
    //   그런데 "오픈 12시, 마감 10시"는 무엇으로 고쳐야 할지가 자명하지 않다.
    //   임의로 뒤집거나 버리면 사장님이 의도한 것과 다른 가게가 조용히 저장된다.
    //
    // ★ 그리고 이건 조용히 두면 안 되는 종류다. 지금까지는 검증이 없어서 저장은 성공하고
    //   화면도 정상인데 **슬롯 생성 루프가 한 번도 안 돌아 손님 쪽 예약 가능 시간이 0개**가 됐다
    //   (ReservationService: while (!cursor.plusMinutes(slotMin).isAfter(close))).
    //   사장님은 예약이 안 들어오는 이유를 알 방법이 없다. 시끄러운 실패가 맞다.

    /**
     * 영업시간·브레이크타임의 정합성을 검사한다. 어긋나면 {@link StoreException} 으로 거절한다.
     *
     * <p><b>반드시 병합이 끝난 엔티티를 넘길 것.</b> 수정 경로는 일부 필드만 오므로
     * 요청 본문끼리 비교하면 기존 값과의 모순을 놓친다.
     *
     * <p>브레이크타임이 <b>한쪽만</b> 온 경우는 거절하지 않고 <b>양쪽을 지운다</b> —
     * 슬롯 계산이 {@code breakStart != null && breakEnd != null} 일 때만 브레이크로 취급하므로
     * 한쪽만 남겨두면 "설정한 것 같은데 적용은 안 되는" 상태가 된다. 그건 데이터를 지우는 쪽이
     * 오해가 적다(사장님 입력이 불완전했던 것이지 모순은 아니다).
     */
    private void validateBusinessHours(Store store) {
        LocalTime open  = store.getOpenTime();
        LocalTime close = store.getCloseTime();

        if (open != null && close != null && !open.isBefore(close)) {
            // 같은 시각도 거절이다 — 길이가 0인 영업시간은 슬롯이 하나도 안 나온다.
            // ⚠️ 자정을 넘는 영업시간(22:00~02:00)은 지금 구조가 지원하지 않는다.
            //    LocalTime 비교라 wrap-around 를 표현할 수 없고, 슬롯 루프도 마찬가지다.
            //    지원하려면 "다음날로 넘어가는 영업"을 모델에 넣어야 하므로 별도 작업이다.
            //    그때까지는 여기서 걸러서 "저장은 됐는데 예약이 안 되는" 상태를 막는다.
            throw new StoreException(
                    "마감 시간은 오픈 시간보다 뒤여야 합니다. 자정을 넘겨 영업하는 경우는 아직 지원하지 않습니다.",
                    HttpStatus.BAD_REQUEST);
        }

        LocalTime breakStart = store.getBreakStartTime();
        LocalTime breakEnd   = store.getBreakEndTime();

        // 한쪽만 온 경우 — 조용히 버리지 않고 양쪽을 지워 "적용 안 되는 반쪽 설정"을 없앤다.
        if (breakStart == null || breakEnd == null) {
            store.setBreakStartTime(null);
            store.setBreakEndTime(null);
            return;
        }

        if (!breakStart.isBefore(breakEnd)) {
            throw new StoreException("브레이크 타임 종료는 시작보다 뒤여야 합니다.", HttpStatus.BAD_REQUEST);
        }

        // 영업시간이 아직 정해지지 않은 가게라면 범위 비교를 할 수 없다 — 여기서 멈춘다.
        if (open == null || close == null) return;

        if (breakStart.isBefore(open) || breakEnd.isAfter(close)) {
            throw new StoreException(
                    "브레이크 타임은 영업시간 안에 있어야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    /** 회차 상한. 이보다 많아지면 SLOT 방식이 맞다. */
    private static final int MAX_SESSION_TIMES = 50;

    // ══ 가게 옵션 정규화 (2026-08-09 신설) ════════════════════════════════
    //
    // ★ 왜 컨트롤러의 @Valid 가 아니라 여기인가
    //   이 두 엔드포인트는 @ModelAttribute(multipart) 라 검증 실패가 BindException 으로
    //   나가 기존 에러 응답 규격과 달라진다. 또 사장님 입력은 Select 라 범위를 벗어날 일이
    //   없고, 실제 위험은 **API 를 직접 두드리는 경우**다. 그럴 땐 거절보다 안전한 값으로
    //   수렴시키는 쪽이 서비스를 멈추지 않는다. 위 clampNearbyRadiusKm 이 이미 그 패턴이다.
    //   생성·수정 두 경로가 **반드시 여기를 지나가게** 해서 한 쪽만 고치는 사고를 막는다.

    /** 예약 단위 시간(분). ★ 0 이면 ReservationService 의 슬롯 루프가 전진하지 않아 **무한루프 + OOM** 이 된다. */
    private static final int MIN_SLOT_MINUTES = 5;
    private static final int MAX_SLOT_MINUTES = 480;
    private static final int DEFAULT_SLOT_MINUTES = 30;

    private Integer clampSlotMinutes(Integer minutes) {
        if (minutes == null) return DEFAULT_SLOT_MINUTES;
        if (minutes < MIN_SLOT_MINUTES) return MIN_SLOT_MINUTES;
        if (minutes > MAX_SLOT_MINUTES) return MAX_SLOT_MINUTES;
        return minutes;
    }

    /**
     * 슬롯당 정원. <b>null = 무제한</b> 이 이 필드의 약속이다.
     * 0 이하를 그대로 저장하면 조회는 "무제한"으로, 예약 검증은 "항상 마감"으로 반대로 판정해
     * 사용자에겐 전 시간대가 열려 보이는데 누르면 전부 마감 에러가 난다. → null 로 통일한다.
     */
    private static final int MAX_CAPACITY_PER_SLOT = 999;

    private Integer normalizeCapacity(Integer capacity) {
        if (capacity == null || capacity <= 0) return null;
        return Math.min(capacity, MAX_CAPACITY_PER_SLOT);
    }

    /** 결제 대기 만료(분). <b>0 = 제한 없음</b>(스케줄러가 건너뛴다). 그 외는 1분~7일. */
    private static final int MAX_PAYMENT_TIMEOUT_MINUTES = 60 * 24 * 7;
    private static final int DEFAULT_PAYMENT_TIMEOUT_MINUTES = 30;
    static final int PAYMENT_TIMEOUT_UNLIMITED = 0;

    private Integer clampPaymentTimeout(Integer minutes) {
        if (minutes == null) return DEFAULT_PAYMENT_TIMEOUT_MINUTES;
        if (minutes <= PAYMENT_TIMEOUT_UNLIMITED) return PAYMENT_TIMEOUT_UNLIMITED;
        return Math.min(minutes, MAX_PAYMENT_TIMEOUT_MINUTES);
    }

    /** 예약 마감(시간 전). null 또는 0 = 제한 없음. 음수는 0 으로 수렴. */
    private static final int MAX_BOOKING_DEADLINE_HOURS = 24 * 365;

    /**
     * 정기 휴무 요일 정규화 — ISO 범위(1~7) 밖 값과 중복을 버린다 (2026-08-11).
     * 폼에서 오는 값이라 신뢰하지 않는다. 범위를 안 자르면 {@code isClosedOn} 이 영원히 못 맞추는
     * 값(예: 0, 8)이 들어가 "휴무로 저장했는데 예약이 들어오는" 상태가 된다.
     */
    private List<Integer> normalizeClosedDays(List<Integer> days) {
        if (days == null) return List.of();
        return days.stream()
                .filter(d -> d != null && d >= 1 && d <= 7)
                .distinct().sorted().toList();
    }

    /**
     * 임시 휴무일 정규화 — 파싱 실패·중복·<b>지난 날짜</b>를 버린다.
     *
     * <p>지난 날짜를 안 걸러내면 이 컬럼이 해가 갈수록 무한히 길어지고(varchar(1000) 상한),
     * 아무 효과도 없는 값이 계속 쌓인다. 저장할 때마다 정리하는 게 별도 청소 배치보다 싸다.
     */
    private List<LocalDate> normalizeClosedDates(List<String> raw) {
        if (raw == null) return List.of();
        LocalDate today = ServiceTime.today();
        List<LocalDate> out = new ArrayList<>();
        for (String v : raw) {
            if (v == null || v.isBlank()) continue;
            try {
                LocalDate d = LocalDate.parse(v.trim());
                if (!d.isBefore(today) && !out.contains(d)) out.add(d);
            } catch (Exception ignored) {
                // 형식이 깨진 값은 조용히 버린다 — 저장을 통째로 실패시킬 만한 사안이 아니다.
            }
        }
        return out.stream().sorted().toList();
    }

    /** null·0 이하 = 제한 없음. 상한 365 — 그 이상은 실수로 보는 게 맞다. */
    private Integer clampMaxAdvanceBookingDays(Integer days) {
        if (days == null || days <= 0) return null;
        return Math.min(days, 365);
    }

    private Integer clampBookingDeadlineHours(Integer hours) {
        if (hours == null) return null;
        if (hours <= 0) return 0;
        return Math.min(hours, MAX_BOOKING_DEADLINE_HOURS);
    }

    /** 노쇼 예약금. 음수가 들어가면 결제 금액이 음수가 된다. */
    private static final int MAX_DEPOSIT = 10_000_000;

    private Integer clampDeposit(Integer amount) {
        if (amount == null) return 0;
        if (amount < 0) return 0;
        return Math.min(amount, MAX_DEPOSIT);
    }

    private static final int MAX_REFUND_DAYS = 365;

    /** 전액 환불 기준일. <b>0 = 환불 없음</b>(sentinel). */
    private Integer clampFullRefundDays(Integer days) {
        if (days == null) return 3;
        if (days <= 0) return 0;
        return Math.min(days, MAX_REFUND_DAYS);
    }

    /**
     * 부분 환불 기준일. <b>0 = 적용 안 함</b>(sentinel).
     * ★ fullDays 이상이면 부분 환불 구간(partial <= d < full)이 비어 설정이 조용히 죽는다.
     * 사장님은 설정했다고 믿고 있는데 아무 일도 안 일어나므로, 차라리 "적용 안 함"으로 정규화해
     * 화면에도 그대로 보이게 한다.
     */
    private Integer clampPartialRefundDays(Integer days, Integer fullDays) {
        if (days == null) return null;
        if (days <= 0) return 0;
        int capped = Math.min(days, MAX_REFUND_DAYS);
        if (fullDays != null && fullDays > 0 && capped >= fullDays) return 0;
        return capped;
    }

    /** 부분 환불율(%). 100 초과면 결제액보다 많이 환불하려다 PG 단에서 실패한다. */
    private Integer clampPartialRefundRate(Integer rate) {
        if (rate == null) return 50;
        if (rate < 0) return 0;
        return Math.min(rate, 100);
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
            Page<Store> storePage = searchStoreEntities(keyword.trim(), pageable);
            // 인메모리 정렬 (키워드 검색 + 정렬 조합)
            List<Store> sorted = sortStores(storePage.getContent(), sort, lat, lng);
            return new PageImpl<>(
                sorted.stream().map(StoreResponse::fromEntity).collect(Collectors.toList()),
                pageable,
                storePage.getTotalElements()
            );
        }
    }

    /**
     * 키워드 검색 실행 경로 선택 — FULLTEXT(빠름) vs LIKE(느리지만 어디서나 동작).
     *
     * <p>FULLTEXT를 쓰지 못하는 경우가 둘 있고, 둘 다 조용히 LIKE로 폴백한다.
     * <ol>
     *   <li>{@code search.store.fulltext-enabled=false} — 테스트(H2)·local 기본값</li>
     *   <li>ngram 토큰 길이보다 짧은 검색어 — ngram 파서는 2글자 미만을 색인하지 않으므로
     *       "김" 같은 1글자 검색이 FULLTEXT에서는 <b>0건</b>이 된다.
     *       사용자 입장에선 검색이 고장난 것으로 보이므로 이 경우만 LIKE로 보낸다.</li>
     * </ol>
     */
    private Page<Store> searchStoreEntities(String keyword, Pageable pageable) {
        if (fulltextEnabled && keyword.length() >= NGRAM_TOKEN_SIZE) {
            return storeRepository.searchStoresFulltextPaged(toBooleanModeQuery(keyword), pageable);
        }
        return storeRepository.searchStoresPaged(keyword, pageable);
    }

    /**
     * 사용자 입력을 MySQL BOOLEAN MODE 검색식으로 안전하게 변환한다.
     *
     * <p><b>이 정제를 빼면 안 되는 이유:</b> BOOLEAN MODE는 {@code + - > < ( ) ~ * " @}를 연산자로 읽는다.
     * 예를 들어 사용자가 {@code "강남 -맛집"}을 치면 "맛집을 제외"로 해석되고,
     * 짝이 맞지 않는 따옴표나 괄호는 <b>SQL 에러(1064/1690)</b>를 낸다. 즉 정제 없이는
     * 사용자가 검색창에 특수문자를 넣는 것만으로 500이 난다.
     *
     * <p>처리 방식: 연산자 문자를 공백으로 치환해 <b>평범한 단어들</b>로 만든 뒤,
     * 각 토큰에 {@code +}를 붙여 AND 검색으로 만든다. LIKE 시절의 동작(입력한 말이 다 들어간 가게)과
     * 가장 가깝기 때문이다. ({@code +} 없이 넘기면 OR가 되어 결과가 과하게 넓어진다)
     */
    private String toBooleanModeQuery(String keyword) {
        String cleaned = keyword.replaceAll("[+\\-><()~*\"@]", " ").trim();
        if (cleaned.isEmpty()) {
            return keyword;   // 특수문자만 입력한 경우 — 어차피 0건이지만 빈 검색식은 문법 오류라 원문을 넘긴다
        }
        StringBuilder sb = new StringBuilder();
        for (String token : cleaned.split("\\s+")) {
            if (token.length() < NGRAM_TOKEN_SIZE) continue;   // ngram이 색인하지 않는 토큰은 조건에서 뺀다
            if (sb.length() > 0) sb.append(' ');
            sb.append('+').append(token);
        }
        return sb.length() > 0 ? sb.toString() : cleaned;
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