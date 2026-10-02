package kr.it.reserve.store.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.dto.StoreRegionGroup;
import kr.it.reserve.store.dto.StoreStatisticsResponse;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.util.StoreRegionNames;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import kr.it.reserve.global.common.PageRequests;
import org.springframework.data.domain.Pageable;

@Slf4j
@RequiredArgsConstructor
@Service
public class StoreService {

    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final FileDeletionOutboxService fileDeletionOutboxService;
    private final DataLifecycleGuard dataLifecycleGuard;
    private final ReservationRepository reservationRepository;
    private final FavoriteRepository favoriteRepository;
    private final PromotionRepository promotionRepository;
    private final AdvertisementRepository advertisementRepository;
    private final PaymentRepository paymentRepository;
    private final ObjectMapper objectMapper;

    /**
     * 가게 검색에 MySQL FULLTEXT(ngram)를 쓸지 여부.
     *
     * <p>별도 MySQL에서 DDL·EXPLAIN·LIKE 결과 동등성을 확인한 뒤에만 true로 바꿀 수 있다.
     * 현재 prod·local·test 기본값은 모두 false다. 테스트 H2에는 {@code MATCH ... AGAINST}가 없고,
     * MySQL도 FULLTEXT 인덱스 없이 켜면 검색 전체가 실패한다.
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
    /** 국내 서비스 전체를 포함하면서 좌표 없는/비정상 원거리 행을 거리 계산에서 배제하는 1차 후보 범위. */
    private static final double DISTANCE_CANDIDATE_RADIUS_KM = 1_000.0;
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
            log.warn("Failed to parse detailImagesMeta, treating as empty: errorType={}",
                    e.getClass().getSimpleName());
            return new ArrayList<>();
        }
    }

    private String toDetailImagesMetaJson(List<ImageDimension> list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("Failed to serialize detailImagesMeta: errorType={}", e.getClass().getSimpleName());
            return null;
        }
    }

    private ImageDimension readImageDimension(MultipartFile file) {
        int[] dim = fileStorageService.readImageDimensions(file);
        return dim != null ? new ImageDimension(dim[0], dim[1]) : new ImageDimension(null, null);
    }

    // 상세 이미지 하나 업로드 결과(key + URL + 원본 크기) — key는 바깥 트랜잭션의 rollback cleanup 등록용
    private record UploadedDetailImage(String key, String url, ImageDimension dim) {}

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
                    return new UploadedDetailImage(key, url, readImageDimension(f));
                }, imageUploadExecutor))
                .toList();
        try {
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
            List<UploadedDetailImage> results = futures.stream().map(CompletableFuture::join).toList();
            // worker 스레드에는 Spring 트랜잭션 문맥이 없으므로 join 뒤 바깥 트랜잭션에 등록한다.
            results.forEach(result -> fileStorageService.registerRollbackCleanup(result.key()));
            return results;
        } catch (CompletionException e) {
            // allOf가 끝난 시점에는 모든 업로드가 끝났으므로, 부분 성공한 객체도 즉시 정리한다.
            futures.stream()
                    .filter(future -> !future.isCompletedExceptionally() && !future.isCancelled())
                    .map(CompletableFuture::join)
                    .forEach(result -> fileStorageService.deleteFile(result.key()));
            if (e.getCause() instanceof RuntimeException re) throw re;
            throw e;
        }
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
                .serviceDomain(parseServiceDomain(request.getServiceDomain(), request.getCategory()))
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
                .imageAutoplayEnabled(!Boolean.FALSE.equals(request.getImageAutoplayEnabled()))
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

        // 전체 엔티티 갱신이 동시 폐업/제재 상태를 예전 값으로 덮어쓰지 않게 같은 행을 잠근다.
        Store store = storeRepository.findByIdForUpdate(id)
                .orElseThrow(StoreException::notFound);
        if (store.isDeleted()) throw StoreException.notFound();

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
            if (request.getServiceDomain() != null && !request.getServiceDomain().isBlank()) {
                store.setServiceDomain(parseServiceDomain(request.getServiceDomain(), store.getCategory()));
            } else if (store.getServiceDomain() == null) {
                // 구버전 클라이언트가 기존 행을 수정해도 이후 탐색 결과가 안정되도록 한 번만 고정한다.
                store.setServiceDomain(ServiceDomain.inferFromCategory(store.getCategory()));
            }
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
            if (request.getImageAutoplayEnabled() != null) store.setImageAutoplayEnabled(request.getImageAutoplayEnabled());
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

    @Transactional(readOnly = true)
    public StoreClosureReadiness getClosureReadiness(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 조회할 권한이 없습니다.");
        }
        return dataLifecycleGuard.inspectStore(id);
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

        // 예약금 순결제액 추이. 결제 완료일 기준이며 확정 환불액은 차감한다.
        Map<LocalDate, Long> revenueMap = new HashMap<>();
        for (Object[] row : paymentRepository.sumNetDepositByPaidDate(
                storeId, start.atStartOfDay(), end.plusDays(1).atStartOfDay())) {
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
        LocalDate today = ServiceTime.today();
        StoreStatisticsResponse.AdSummary adSummary = advertisementRepository
                .findFirstByStoreIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateAscIdAsc(
                        storeId, AdStatus.ACTIVE, today, today)
                .map(ad -> StoreStatisticsResponse.AdSummary.builder()
                        .adType(ad.getAdType().name())
                        .status(ad.getStatus().name())
                        .daysRemaining((int) ChronoUnit.DAYS.between(today, ad.getEndDate()))
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
     * 가게 영업 종료.
     *
     * <p>예약·결제·환불·리뷰·광고 원장은 삭제하지 않는다. 공개 목록에서만 숨기고,
     * 비금전성 연결(즐겨찾기/홍보)은 정리하며 이미지 삭제는 durable outbox에 맡긴다.
     */
    @Transactional
    public void deleteStore(Long id, Member member) {
        // 예약 생성·수정과 같은 가게 행 잠금을 사용한다. 준비도 확인 직후 새 예약이
        // 끼어드는 check-then-close 레이스를 막는다.
        Store store = storeRepository.findByIdForUpdate(id)
                .orElseThrow(StoreException::notFound);

        if (store.isDeleted()) {
            throw StoreException.notFound();
        }
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게 영업을 종료할 권한이 없습니다.");
        }

        dataLifecycleGuard.requireStoreClosureAllowed(id);

        log.info("Store closure started: storeId={}", id);

        // 공개/추천 연결은 즉시 제거한다. 거래 원장과 후기 이력은 그대로 둔다.
        favoriteRepository.deleteByStoreId(id);
        promotionRepository.deleteByStoreId(id);

        Long ownerId = store.getOwner() != null ? store.getOwner().getId() : null;
        enqueueManagedFileDeletion(
                store.getMainImageUrl(),
                ownerId != null ? FileStoragePaths.storeThumbnail(ownerId, id) : null,
                "STORE_MAIN_IMAGE",
                id);
        store.getDetailImageList().forEach(image -> enqueueManagedFileDeletion(
                image,
                ownerId != null ? FileStoragePaths.storeImage(ownerId, id) : null,
                "STORE_DETAIL_IMAGE",
                id));

        advertisementRepository.findByStoreId(id).forEach(ad -> {
            ad.getImageUrlList().forEach(image -> enqueueManagedFileDeletion(
                    image,
                    ownerId != null ? FileStoragePaths.advertisement(ownerId, id) : null,
                    "ADVERTISEMENT_IMAGE",
                    ad.getId()));
            ad.setImageUrlList(List.of());
            // Store 잠금 아래 DataLifecycleGuard가 미결 원장과 미이관 광고를 먼저 차단했다.
            // 금융 기록은 보존하고 실패한 신청의 표시 상태만 닫는다.
            if (ad.getStatus() == AdStatus.PAYMENT_FAILED) {
                ad.setStatus(AdStatus.CANCELLED);
            }
        });

        store.setMainImageUrl(null);
        store.setMainImageWidth(null);
        store.setMainImageHeight(null);
        store.setDetailImageList(List.of());
        store.setDetailImagesMeta(null);
        store.softDelete();

        log.info("Store closure completed: storeId={}", id);
    }

    /**
     * 이미지 업데이트 보조 메서드 (가독성을 위해 분리)
     */
    private void updateStoreImages(Store store, StoreUpdateRequest request) {
        Long memberId = store.getOwner().getId();
        Long storeId = store.getId();
        String mainImagePrefix = FileStoragePaths.storeThumbnail(memberId, storeId);
        String detailImagePrefix = FileStoragePaths.storeImage(memberId, storeId);

        // 새 파일을 S3에 올리기 전에 기존 URL 참조를 전부 검증한다. 검증을 뒤로 미루면
        // 잘못된 요청을 409로 거절하면서도 S3에는 새 객체가 남는 부분 성공이 생긴다.
        validateExistingStoreImageReferences(store, request);
        // 순서 정보도 업로드 전에 푼다 — 잘못된 순서를 거절하면서 새 파일만 S3 에 남기지 않게.
        List<DetailImageSlot> detailOrder = resolveDetailImageOrder(request);

        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            String oldMainImage = store.getMainImageUrl();
            String key = fileStorageService.storeFile(
                    request.getMainImage(), mainImagePrefix);
            store.setMainImageUrl(fileStorageService.getPublicUrl(key));
            int[] dim = fileStorageService.readImageDimensions(request.getMainImage());
            store.setMainImageWidth(dim != null ? dim[0] : null);
            store.setMainImageHeight(dim != null ? dim[1] : null);
            enqueueManagedFileDeletion(
                    oldMainImage, mainImagePrefix, "STORE_MAIN_IMAGE", storeId);
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

        List<String> keptUrls = request.getExistingDetailImageUrls() != null
                ? request.getExistingDetailImageUrls() : List.of();
        List<UploadedDetailImage> uploaded = request.getDetailImages() != null
                ? uploadDetailImagesParallel(request.getDetailImages(), memberId, storeId) : List.of();

        List<String> finalDetailImages = new ArrayList<>();
        List<ImageDimension> finalDetailDims = new ArrayList<>();
        if (detailOrder == null) {
            // 순서 정보가 없는 예전 클라이언트: 기존 이미지 → 새 이미지
            for (String url : keptUrls) {
                finalDetailImages.add(url);
                finalDetailDims.add(urlToDim.getOrDefault(url, new ImageDimension(null, null)));
            }
            for (UploadedDetailImage r : uploaded) {
                finalDetailImages.add(r.url());
                finalDetailDims.add(r.dim());
            }
        } else {
            for (DetailImageSlot slot : detailOrder) {
                if (slot.existing()) {
                    String url = keptUrls.get(slot.index());
                    finalDetailImages.add(url);
                    finalDetailDims.add(urlToDim.getOrDefault(url, new ImageDimension(null, null)));
                } else {
                    UploadedDetailImage r = uploaded.get(slot.index());
                    finalDetailImages.add(r.url());
                    finalDetailDims.add(r.dim());
                }
            }
        }

        // 삭제된 파일 처리
        List<String> currentDetailImages = store.getDetailImageList();
        if (currentDetailImages != null) {
            for (String existingUrl : currentDetailImages) {
                if (!finalDetailImages.contains(existingUrl)) {
                    enqueueManagedFileDeletion(
                            existingUrl, detailImagePrefix, "STORE_DETAIL_IMAGE", storeId);
                }
            }
        }
        store.setDetailImageList(finalDetailImages);
        store.setDetailImagesMeta(toDetailImagesMetaJson(finalDetailDims));
    }

    /**
     * 기존 이미지 URL은 이 가게에 지금 저장된 같은 역할의 값과 정확히 같을 때만 받는다.
     *
     * <p>URL은 공개값이라 요청자가 다른 가게 URL을 보낼 수 있지만, 저장값과 달라 여기서 막힌다.
     * 소유자·가게 ID 경로 검사는 받을 때가 아니라 지울 때({@link #enqueueManagedFileDeletion}) 한다 —
     * 2026-04-26 이전 옛 경로(stores/…)로 저장된 가게도 사진을 유지한 채 수정할 수 있어야 하고,
     * 이미 심어진 남의 URL이 있어도 경계 밖이라 교체·폐업 때 지워지지 않는다.
     */
    private void validateExistingStoreImageReferences(Store store, StoreUpdateRequest request) {
        String requestedMain = request.getExistingMainImageUrl();
        if (requestedMain != null
                && (requestedMain.isBlank() || !requestedMain.equals(store.getMainImageUrl()))) {
            throw staleStoreImageReference();
        }

        List<String> requestedDetails = request.getExistingDetailImageUrls();
        if (requestedDetails == null) return;

        Set<String> currentDetails = new HashSet<>(store.getDetailImageList());
        Set<String> uniqueRequestedDetails = new HashSet<>();
        for (String requestedDetail : requestedDetails) {
            if (requestedDetail == null
                    || requestedDetail.isBlank()
                    || !currentDetails.contains(requestedDetail)
                    || !uniqueRequestedDetails.add(requestedDetail)) {
                throw staleStoreImageReference();
            }
        }
    }

    /** 상세 이미지 한 칸 — 기존 이미지(existingDetailImageUrls)의 i번째인지, 새 파일(detailImages)의 j번째인지. */
    private record DetailImageSlot(boolean existing, int index) {}

    /**
     * {@code detailImageOrder} 를 칸 목록으로 푼다. 비어 있으면 {@code null} — 기존 → 새 순서를 그대로 쓴다.
     *
     * <p>기존 개수 + 새 개수와 길이가 같고, 모든 항목이 범위 안이며 중복이 없어야 한다 = 정확히 한 번씩 쓰는 순열.
     * 하나라도 어긋나면 사진이 빠지거나 두 번 들어가므로 저장하지 않고 거절한다.
     */
    private List<DetailImageSlot> resolveDetailImageOrder(StoreUpdateRequest request) {
        List<String> order = request.getDetailImageOrder();
        if (order == null || order.isEmpty()) return null;

        int existingCount = request.getExistingDetailImageUrls() != null ? request.getExistingDetailImageUrls().size() : 0;
        int newCount = request.getDetailImages() == null ? 0
                : (int) request.getDetailImages().stream().filter(f -> f != null && !f.isEmpty()).count();
        if (order.size() != existingCount + newCount) throw invalidDetailImageOrder();

        Set<String> seen = new HashSet<>();
        List<DetailImageSlot> slots = new ArrayList<>();
        for (String token : order) {
            if (token == null || !token.matches("[en]\\d{1,2}") || !seen.add(token)) throw invalidDetailImageOrder();
            boolean existing = token.charAt(0) == 'e';
            int index = Integer.parseInt(token.substring(1));
            if (index >= (existing ? existingCount : newCount)) throw invalidDetailImageOrder();
            slots.add(new DetailImageSlot(existing, index));
        }
        return slots;
    }

    private StoreException invalidDetailImageOrder() {
        return new StoreException(
                "상세 이미지 순서 정보가 올바르지 않습니다. 새로고침한 뒤 다시 시도해주세요.",
                HttpStatus.BAD_REQUEST);
    }

    private StoreException staleStoreImageReference() {
        return new StoreException(
                "가게 이미지가 다른 곳에서 변경되었습니다. 새로고침한 뒤 다시 시도해주세요.",
                HttpStatus.CONFLICT);
    }

    /** 검증되지 않은 DB URL이 있어도 다른 리소스의 S3 객체를 삭제하지 않는다. */
    private void enqueueManagedFileDeletion(
            String target,
            String expectedPrefix,
            String sourceType,
            Long sourceId) {
        if (target == null || target.isBlank()) return;
        if (expectedPrefix == null
                || !fileStorageService.isManagedFileUnderPrefix(target, expectedPrefix)) {
            log.warn("Skipped file deletion outside resource boundary: sourceType={}, sourceId={}",
                    sourceType, sourceId);
            return;
        }
        fileDeletionOutboxService.enqueue(target, sourceType, sourceId);
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

    private ServiceDomain parseServiceDomain(String raw, String category) {
        if (raw == null || raw.isBlank()) return ServiceDomain.inferFromCategory(category);
        ServiceDomain parsed = ServiceDomain.parseOrNull(raw);
        if (parsed == null) {
            throw new StoreException("올바른 서비스 분야를 선택해주세요.", HttpStatus.BAD_REQUEST);
        }
        return parsed;
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

    /** 검색·공개 정책·전체 정렬 후 페이지를 자른다. 첫 페이지 안에서만 다시 정렬하지 않는다. */
    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(String keyword, String sort, int page, int size, Double lat, Double lng) {
        return searchStoresPage(keyword, sort, page, size, lat, lng, null, null);
    }

    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(
            String keyword, String sort, int page, int size, Double lat, Double lng, String domain) {
        return searchStoresPage(keyword, sort, page, size, lat, lng, domain, null);
    }

    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(
            String keyword, String sort, int page, int size, Double lat, Double lng, String domain, String region) {
        return searchStoresPage(keyword, sort, page, size, lat, lng, domain, region);
    }

    private Page<StoreResponse> searchStoresPage(
            String keyword, String sort, int page, int size, Double lat, Double lng, String domain, String region) {
        Pageable pageable = PageRequests.bounded(page, size);
        return sortedSearch(keyword, sort, pageable, lat, lng, domain, region).map(StoreResponse::fromEntity);
    }

    private Page<Store> sortedSearch(
            String keyword, String sort, Pageable pageable, Double lat, Double lng, String domain, String region) {
        String normalizedSort = normalizeSort(sort);
        if ("distance".equals(normalizedSort) && !validCoordinates(lat, lng)) {
            normalizedSort = "rating";
        }
        ServiceDomain domainFilter = ServiceDomain.parseOrNull(domain);
        String regionFilter = region == null ? "" : region.trim();
        String normalized = keyword == null ? "" : keyword.trim();
        String booleanQuery = toBooleanModeQuery(normalized);
        boolean fulltextCompatible = domainFilter == null
                && regionFilter.isEmpty()
                && !"recommended".equals(normalizedSort)
                && !"distance".equals(normalizedSort);
        if (fulltextEnabled && fulltextCompatible && !booleanQuery.isEmpty()) {
            // 네이티브 컬럼명은 JPQL 속성명과 다르다. 허용한 sort를 명시적 CASE ORDER BY에 전달한다.
            return storeRepository.searchStoresFulltextPaged(booleanQuery, normalizedSort, ServiceTime.today(), pageable);
        }

        // 공개 상태·검색·분야(legacy null 추론)·지역·노출형 우선순위·거리 후보를 같은 DB 쿼리/count에 적용한다.
        // Pageable은 그대로 전달하되 정렬은 Specification이 허용 목록으로만 구성한다.
        return storeRepository.findAll(
                StoreSearchSpecification.publicSearch(
                        normalized,
                        normalizedSort,
                        domainFilter,
                        regionFilter,
                        lat,
                        lng,
                        DISTANCE_CANDIDATE_RADIUS_KM,
                        ServiceTime.today()),
                pageable);
    }

    private String normalizeSort(String sort) {
        if ("reviewCount".equals(sort)) return "reviews";
        return "recommended".equals(sort) || "recent".equals(sort) || "reviews".equals(sort)
                || "distance".equals(sort) ? sort : "rating";
    }

    /** 연산자만 있거나 색인되지 않는 짧은 토큰이 섞이면 원문 LIKE 검색으로 보낸다. */
    private String toBooleanModeQuery(String keyword) {
        String cleaned = keyword.replaceAll("[+\\-><()~*\\\"@]", " ").trim();
        if (cleaned.isEmpty()) return "";
        StringBuilder result = new StringBuilder();
        for (String token : cleaned.split("\\s+")) {
            if (token.length() < NGRAM_TOKEN_SIZE) return "";
            if (!result.isEmpty()) result.append(' ');
            result.append('+').append(token);
        }
        return result.toString();
    }

    private static boolean validCoordinates(Double lat, Double lng) {
        return lat != null && lng != null && Double.isFinite(lat) && Double.isFinite(lng)
                && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    }

    /** 내부 전체 조회도 공개 정책과 안정 정렬을 공유한다. */
    @Transactional(readOnly = true)
    public List<StoreResponse> searchStores(String keyword, String sort) {
        return searchStoreList(keyword, sort, null, null);
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> searchStores(String keyword, String sort, String domain) {
        return searchStoreList(keyword, sort, domain, null);
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> searchStores(String keyword, String sort, String domain, String region) {
        return searchStoreList(keyword, sort, domain, region);
    }

    private List<StoreResponse> searchStoreList(String keyword, String sort, String domain, String region) {
        return sortedSearch(keyword, sort, Pageable.unpaged(), null, null, domain, region)
                .map(StoreResponse::fromEntity).getContent();
    }

    /** 현재 가게가 실제로 있는 시도·시군구만 모아 인기 지역과 계층 목록에 공유한다. */
    @Transactional(readOnly = true)
    public List<StoreRegionGroup> getAvailableRegions() {
        Map<String, Long> regionCounts = new HashMap<>();
        Map<String, Map<String, Long>> areaCounts = new HashMap<>();
        for (String address : storeRepository.findPublicAddresses()) {
            String[] parts = StoreRegionNames.addressParts(address);
            if (parts.length == 0) continue;
            String region = parts[0];
            regionCounts.merge(region, 1L, Long::sum);
            if (parts.length > 1) {
                areaCounts.computeIfAbsent(region, ignored -> new HashMap<>())
                        .merge(parts[1], 1L, Long::sum);
            }
        }
        return regionCounts.entrySet().stream()
                .sorted((a, b) -> {
                    int byCount = Long.compare(b.getValue(), a.getValue());
                    return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());
                })
                .map(entry -> {
                    List<StoreRegionGroup.Area> areas = areaCounts
                            .getOrDefault(entry.getKey(), Map.of()).entrySet().stream()
                            .sorted((a, b) -> {
                                int byCount = Long.compare(b.getValue(), a.getValue());
                                return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());
                            })
                            .map(area -> new StoreRegionGroup.Area(area.getKey(), area.getValue()))
                            .toList();
                    return new StoreRegionGroup(entry.getKey(), entry.getValue(), areas);
                })
                .toList();
    }
}
