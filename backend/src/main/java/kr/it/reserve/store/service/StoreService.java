package kr.it.reserve.store.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreRegionGroup;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.dto.StoreStatisticsResponse;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.event.StoreClosed;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.search.StoreFulltextSearch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;

@Slf4j
@RequiredArgsConstructor
@Service
public class StoreService {
    private static final String EDIT_FORBIDDEN_MESSAGE = "가게를 수정할 권한이 없어요.";

    private final StoreRepository storeRepository;
    private final StoreFulltextSearch storeFulltextSearch;
    private final FileStorageService fileStorageService;
    private final FileDeletionOutboxService fileDeletionOutboxService;
    private final DataLifecycleGuard dataLifecycleGuard;
    private final ReservationRepository reservationRepository;
    private final FavoriteRepository favoriteRepository;
    private final PromotionRepository promotionRepository;
    private final AdvertisementRepository advertisementRepository;
    private final PaymentRepository paymentRepository;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher events;
    @Autowired(required = false)
    private StoreUpdates updates;

    /**
     * MySQL ngram=2와 일치하는 인덱스에서만 후보를 사용하고 원문 동등성이 맞지 않으면 LIKE로 복귀한다. false이면 탐지하지 않는다.
     * {@code @Value}는 생성자 대신 필드에 주입하므로 final로 바꾸지 않는다.
     */
    @Value("${search.store.fulltext-enabled:true}")
    private boolean fulltextEnabled;

    // 이름을 "imageUploadExecutor"로 맞춰서 AsyncConfig의 @Bean(name = "imageUploadExecutor")와
    // 매칭시킴 — Lombok의 @RequiredArgsConstructor는 @Qualifier를 생성자로 복사해주지 않아서
    // (IDE 경고 확인함), 대신 Spring의 "타입이 여러 개면 파라미터명=빈이름으로 매칭" 폴백에 의존.
    private final Executor imageUploadExecutor;

    /**
     * 가게 등록
     * 순서: Store 먼저 저장(ID 획득) → 이미지 업로드(storeId 경로 사용) → 이미지 URL 업데이트
     */
    @Transactional
    public StoreResponse createStore(StoreCreateRequest request, Member owner) {

        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new StoreException("가게 이름은 필수예요.", HttpStatus.BAD_REQUEST);
        }

        // 1단계: 이미지 없이 Store 먼저 저장 → storeId 확보
        Store store = Store.builder()
                .owner(owner)
                .name(request.getName().trim())
                .reservationEnabled(!Boolean.FALSE.equals(request.getReservationEnabled()))
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
                .autoApprovalEnabled(Boolean.TRUE.equals(request.getAutoApprovalEnabled()))
                .autoCompletionEnabled(Boolean.TRUE.equals(request.getAutoCompletionEnabled()))
                .serviceDurationMinutes(kr.it.reserve.reservation.service.ReservationCompletionPolicy.duration(request.getServiceDurationMinutes()))
                .bookingDeadlineHours(clampBookingDeadlineHours(request.getBookingDeadlineHours()))
                .paymentTimeoutMinutes(clampPaymentTimeout(request.getPaymentTimeoutMinutes()))
                .reservationSlotMinutes(clampSlotMinutes(request.getReservationSlotMinutes()))
                .nearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()))
                .allowLatePayment(Boolean.TRUE.equals(request.getAllowLatePayment()))
                .allowDuplicateReservation(Boolean.TRUE.equals(request.getAllowDuplicateReservation()))
                .emailNotificationEnabled(!Boolean.FALSE.equals(request.getEmailNotificationEnabled()))
                .imageAutoplayEnabled(!Boolean.FALSE.equals(request.getImageAutoplayEnabled()))
                .waitingIntakeMode(WaitingIntakeMode.parse(request.getWaitingIntakeMode()))
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
        // 브레이크타임은 영업시간 입력과 독립적으로 반영한다.
        store.setBreakStartTime(request.getBreakStartTime());
        store.setBreakEndTime(request.getBreakEndTime());
        // 부분 수정도 같은 규칙을 적용하도록 저장할 최종 값으로 검증한다.
        validateBusinessHours(store);
        normalizeDepositPaymentPolicy(store);

        Store savedStore = storeRepository.save(store);
        Long storeId = savedStore.getId();

        images().create(savedStore, request, owner.getId());

        log.info("Store registered: storeId={}", storeId);
        if (updates != null) updates.changed(savedStore, EntityUpdates.Operation.CREATED, false);
        return StoreResponse.fromEntity(savedStore);
    }

    /**
     * 내가 등록한 가게 목록 조회
     */
    @Transactional(readOnly = true)
    public List<StoreResponse> getMyStores(Member member) {
        return directory().getMyStores(member);
    }

    /**
     * 가게 수정용 데이터 조회 (소유자/관리자만 접근 가능)
     * 공개 API와 달리 소유자 본인 검증 후 전체 설정을 반환
     */
    @Transactional(readOnly = true)
    public StoreResponse getStoreForEdit(Long id, Member member) {
        return directory().getStoreForEdit(id, member);
    }

    /**
     * 가게 상세 조회
     * 제재(정지/영구정지) 가게는 일반 사용자에게는 조회 불가 — 소프트 삭제와 동일하게 처리
     */
    @Transactional(readOnly = true)
    public StoreResponse getStore(Long id) {
        return directory().getStore(id);
    }

    @Transactional
    public StoreResponse updateStore(Long id, StoreUpdateRequest request, Member member) {
        log.info("Store update started: storeId={}", id);

        // 전체 엔티티 갱신이 동시 폐업/제재 상태를 예전 값으로 덮어쓰지 않게 같은 행을 잠근다.
        Store store = storeRepository.findByIdForUpdate(id)
                .orElseThrow(StoreException::notFound);
        if (store.isDeleted()) throw StoreException.notFound();

        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            log.error("Unauthorized store access: storeOwnerId={}, requestMemberId={}", store.getOwner().getId(), member.getId());
            throw StoreException.forbidden(EDIT_FORBIDDEN_MESSAGE);
        }

        try {
            applyStoreDetails(store, request);
            applyRefundPolicy(store, request);
            if (request.getMaxCapacityPerSlotRaw() != null) {
                String raw = request.getMaxCapacityPerSlotRaw().trim();
                if (!raw.isEmpty() && request.getMaxCapacityPerSlot() == null) {
                    throw new StoreException("예약 인원을 올바른 숫자로 입력해주세요.", HttpStatus.BAD_REQUEST);
                }
                store.setMaxCapacityPerSlot(normalizeCapacity(request.getMaxCapacityPerSlot()));
            }
            if (request.getAutoApprovalEnabled() != null) store.setAutoApprovalEnabled(request.getAutoApprovalEnabled());
            if (request.getAutoCompletionEnabled() != null) store.setAutoCompletionEnabled(request.getAutoCompletionEnabled());
            if (request.getServiceDurationMinutes() != null) store.setServiceDurationMinutes(kr.it.reserve.reservation.service.ReservationCompletionPolicy.duration(request.getServiceDurationMinutes()));
            if (request.hasField("bookingDeadlineHours")) store.setBookingDeadlineHours(clampBookingDeadlineHours(request.getBookingDeadlineHours()));
            if (request.getPaymentTimeoutMinutes() != null) store.setPaymentTimeoutMinutes(clampPaymentTimeout(request.getPaymentTimeoutMinutes()));
            if (request.getReservationSlotMinutes() != null) store.setReservationSlotMinutes(clampSlotMinutes(request.getReservationSlotMinutes()));
            if (request.getNearbyRadiusKm() != null) store.setNearbyRadiusKm(clampNearbyRadiusKm(request.getNearbyRadiusKm()));
            if (request.getAllowLatePayment() != null) store.setAllowLatePayment(request.getAllowLatePayment());
            if (request.getAllowDuplicateReservation() != null) store.setAllowDuplicateReservation(request.getAllowDuplicateReservation());
            // emailNotificationEnabled: null이면 변경 안 함
            if (request.getEmailNotificationEnabled() != null) store.setEmailNotificationEnabled(request.getEmailNotificationEnabled());
            if (request.getImageAutoplayEnabled() != null) store.setImageAutoplayEnabled(request.getImageAutoplayEnabled());
            if (request.getReservationEnabled() != null) store.setReservationEnabled(request.getReservationEnabled());
            if (request.getWaitingIntakeMode() != null) {
                store.setWaitingIntakeMode(WaitingIntakeMode.parse(request.getWaitingIntakeMode()));
            }
            // 누락 = 유지, 빈 목록/빈 값 = 해제. 영역별 수정에서도 다른 영역을 지우지 않는다.
            if (request.hasField("closedDays")) store.setClosedDayList(normalizeClosedDays(request.getClosedDays()));
            if (request.hasField("closedDates")) store.setClosedDateList(normalizeClosedDates(request.getClosedDates()));
            if (request.hasField("openDate") || request.hasField("closeDate")) {
                applyOperatingPeriod(store,
                        request.hasField("openDate") ? request.getOpenDate() : store.getOpenDate() == null ? null : store.getOpenDate().toString(),
                        request.hasField("closeDate") ? request.getCloseDate() : store.getCloseDate() == null ? null : store.getCloseDate().toString());
            }
            if (request.hasField("bookingType") || request.hasField("sessionTimes")) {
                applyBookingType(store, request.hasField("bookingType") ? request.getBookingType() : store.resolveBookingType().name(),
                        request.hasField("sessionTimes") ? request.getSessionTimes() : store.getSessionTimeList().stream().map(LocalTime::toString).toList());
            }
            if (request.hasField("maxAdvanceBookingDays")) store.setMaxAdvanceBookingDays(clampMaxAdvanceBookingDays(request.getMaxAdvanceBookingDays()));
            if (request.getOpenTime() != null) store.setOpenTime(request.getOpenTime());
            if (request.getCloseTime() != null) store.setCloseTime(request.getCloseTime());
            if (request.hasField("breakStartTime")) store.setBreakStartTime(request.getBreakStartTime());
            if (request.hasField("breakEndTime")) store.setBreakEndTime(request.getBreakEndTime());
            // 부분 수정은 기존 값과 병합한 뒤 검사해 영업시간 모순을 놓치지 않는다.
            validateBusinessHours(store);
            normalizeDepositPaymentPolicy(store);

            if (request.getKeywords() != null) {
                store.setKeywordList(request.getKeywords());
            }

            // 메인 이미지 및 상세 이미지 처리 (기존 로직 유지)
            updateStoreImages(store, request);

            Store savedStore = storeRepository.save(store);
            log.info("Store updated: storeId={}", savedStore.getId());
            if (updates != null) updates.changed(savedStore, EntityUpdates.Operation.UPDATED, false);

            return StoreResponse.fromEntity(savedStore);
        } catch (Exception e) {
            log.error("Store update failed: storeId={}", id, e);
            throw e;
        }
    }

    private void applyStoreDetails(Store store, StoreUpdateRequest request) {
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
    }

    private void applyRefundPolicy(Store store, StoreUpdateRequest request) {
        int nextFullDays = request.getFullRefundDays() == null ? refundPolicy(store).fullDays() : clampFullRefundDays(request.getFullRefundDays());
        int nextPartialDays = request.getPartialRefundDays() == null ? (store.getPartialRefundDays() == null ? 1 : store.getPartialRefundDays())
                : clampPartialRefundDays(request.getPartialRefundDays(), nextFullDays);
        int nextRate = request.getPartialRefundRate() == null ? (store.getPartialRefundRate() == null ? 50 : store.getPartialRefundRate())
                : clampPartialRefundRate(request.getPartialRefundRate());
        if (!refundPolicy(store).equals(effectiveRefundPolicy(nextFullDays, nextPartialDays, nextRate))
                && reservationRepository.existsRefundPolicyObligation(store.getId(), List.of(
                        Reservation.ReservationStatus.PENDING,
                        Reservation.ReservationStatus.CONFIRMED,
                        Reservation.ReservationStatus.UNCONFIRMED), ServiceTime.today())) {
            throw new StoreException("남아 있는 유료 예약이 있어 환불 기준을 바꿀 수 없어요. 기존 예약을 처리한 뒤 다시 수정해주세요.", HttpStatus.CONFLICT);
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
    }

    private record RefundPolicy(int fullDays, int partialDays, int partialRate) { }

    private RefundPolicy refundPolicy(Store store) {
        return effectiveRefundPolicy(store.getFullRefundDays() == null ? 3 : store.getFullRefundDays(),
                store.getPartialRefundDays() == null ? 1 : store.getPartialRefundDays(),
                store.getPartialRefundRate() == null ? 50 : store.getPartialRefundRate());
    }

    private RefundPolicy effectiveRefundPolicy(int fullDays, int partialDays, int partialRate) {
        if (fullDays <= 0) return new RefundPolicy(0, 0, 0);
        if (partialDays <= 0 || partialDays >= fullDays || partialRate <= 0) return new RefundPolicy(fullDays, 0, 0);
        return new RefundPolicy(fullDays, partialDays, partialRate);
    }

    /**
     * 자동 승인 토글 (PATCH 전용)
     */
    @Transactional
    public StoreResponse toggleAutoApproval(Long id, boolean enabled, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden(EDIT_FORBIDDEN_MESSAGE);
        }
        store.setAutoApprovalEnabled(enabled);
        if (updates != null) updates.changed(store, EntityUpdates.Operation.UPDATED, false);
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
            throw StoreException.forbidden("가게를 조회할 권한이 없어요.");
        }
        return reservationRepository.countActiveReservationsByStoreId(id);
    }

    @Transactional(readOnly = true)
    public StoreClosureReadiness getClosureReadiness(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getOwner() != null && !store.getOwner().getId().equals(member.getId())) {
            throw StoreException.forbidden("가게를 조회할 권한이 없어요.");
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
        return new StoreStatistics(storeRepository, reservationRepository, paymentRepository, advertisementRepository).getStoreStatistics(storeId, member, range);
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
            throw StoreException.forbidden("가게 영업을 종료할 권한이 없어요.");
        }

        dataLifecycleGuard.requireStoreClosureAllowed(id);

        log.info("Store closure started: storeId={}", id);

        // 공개/추천 연결은 즉시 제거한다. 거래 원장과 후기 이력은 그대로 둔다.
        favoriteRepository.deleteByStoreId(id);
        promotionRepository.softDeleteByStoreId(id, LocalDateTime.now(ZoneOffset.UTC));
        events.publishEvent(new StoreClosed(id));

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
        boolean wasPublic = StoreUpdates.publicStore(store);
        store.softDelete();
        if (updates != null) updates.changed(store, EntityUpdates.Operation.DELETED, wasPublic);

        log.info("Store closure completed: storeId={}", id);
    }

    private StoreDirectory directory() {
        return new StoreDirectory(storeRepository, storeFulltextSearch, fulltextEnabled);
    }

    private StoreImages images() {
        return new StoreImages(fileStorageService, fileDeletionOutboxService, objectMapper, imageUploadExecutor);
    }

    private void updateStoreImages(Store store, StoreUpdateRequest request) {
        images().updateStoreImages(store, request);
    }

    private void enqueueManagedFileDeletion(String target, String prefix, String type, Long id) {
        images().enqueueManagedFileDeletion(target, prefix, type, id);
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

    /** 이미 종료된 운영 기간도 보존한다. 잘못된 날짜는 제한 없음으로 정규화하되 종료일이 시작일보다 이르면 거부한다. */
    private void applyOperatingPeriod(Store store, String rawOpen, String rawClose) {
        LocalDate open  = parseIsoDateOrNull(rawOpen);
        LocalDate close = parseIsoDateOrNull(rawClose);

        if (open != null && close != null && close.isBefore(open)) {
            throw new StoreException(
                    "운영 종료일은 시작일보다 뒤여야 해요.", HttpStatus.BAD_REQUEST);
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

    /** 알 수 없는 예약 방식은 SLOT으로 해석한다. SESSION은 회차가 필요하며, 다른 방식으로 바꿀 때도 기존 회차 목록을 덮어쓴다. */
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

    /** 부분 수정은 병합이 끝난 엔티티로 영업시간을 검사한다. 브레이크 타임 한쪽만 있으면 양쪽을 비운다. */
    private void normalizeDepositPaymentPolicy(Store store) {
        // 결제액이 없는 가게는 나중 결제를 사용할 수 없다. 기존 예약의 금액·환불 스냅샷은 수정하지 않는다.
        if (store.getNoShowDeposit() == null || store.getNoShowDeposit() <= 0) store.setAllowLatePayment(false);
    }

    private void validateBusinessHours(Store store) {
        LocalTime open  = store.getOpenTime();
        LocalTime close = store.getCloseTime();

        if (open != null && close != null && !open.isBefore(close)) {
            // 같은 시각도 거절이다 — 길이가 0인 영업시간은 슬롯이 하나도 안 나온다.
            // 주의: 자정을 넘는 영업시간(22:00~02:00)은 지금 구조가 지원하지 않는다.
            //    LocalTime 비교라 wrap-around 를 표현할 수 없고, 슬롯 루프도 마찬가지다.
            //    지원하려면 "다음날로 넘어가는 영업"을 모델에 넣어야 하므로 별도 작업이다.
            //    그때까지는 여기서 걸러서 "저장은 됐는데 예약이 안 되는" 상태를 막는다.
            throw new StoreException(
                    "마감 시간은 오픈 시간보다 뒤여야 해요. 자정을 넘겨 영업하는 경우는 아직 지원하지 않아요.",
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
            throw new StoreException("브레이크 타임 종료는 시작보다 뒤여야 해요.", HttpStatus.BAD_REQUEST);
        }

        // 영업시간이 아직 정해지지 않은 가게라면 범위 비교를 할 수 없다 — 여기서 멈춘다.
        if (open == null || close == null) return;

        if (breakStart.isBefore(open) || breakEnd.isAfter(close)) {
            throw new StoreException(
                    "브레이크 타임은 영업시간 안에 있어야 해요.", HttpStatus.BAD_REQUEST);
        }
    }

    /** 회차 상한. 이보다 많아지면 SLOT 방식이 맞다. */
    private static final int MAX_SESSION_TIMES = 50;

    // 가게 옵션 정규화
    //
    // 왜 컨트롤러의 @Valid 가 아니라 여기인가
    //   이 두 엔드포인트는 @ModelAttribute(multipart) 라 검증 실패가 BindException 으로
    //   나가 기존 에러 응답 규격과 달라진다. 또 사장님 입력은 Select 라 범위를 벗어날 일이
    //   없고, 실제 위험은 **API 를 직접 두드리는 경우**다. 그럴 땐 거절보다 안전한 값으로
    //   수렴시키는 쪽이 서비스를 멈추지 않는다. 위 clampNearbyRadiusKm 이 이미 그 패턴이다.
    //   생성·수정 두 경로가 **반드시 여기를 지나가게** 해서 한 쪽만 고치는 사고를 막는다.

    /** 슬롯 생성이 전진하도록 예약 단위 시간은 양수여야 한다. */
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

    /** 휴무 요일은 ISO 범위 1~7 안의 중복 없는 값으로 정규화한다. */
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
    private static final int MAX_DEPOSIT = 100_000;

    private Integer clampDeposit(Integer amount) {
        if (amount == null) return 0;
        if (amount < 0 || amount > MAX_DEPOSIT) {
            throw new StoreException("노쇼 예약금은 0~100,000원 사이로 설정해주세요.", HttpStatus.BAD_REQUEST);
        }
        return amount;
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
     * fullDays 이상이면 부분 환불 구간(partial <= d < full)이 비어 설정이 조용히 죽는다.
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
        return searchStoresPage(keyword, sort, page, size, lat, lng, new SearchScope(null, null));
    }

    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(
            String keyword, String sort, int page, int size, Double lat, Double lng, String domain) {
        return searchStoresPage(keyword, sort, page, size, lat, lng, new SearchScope(domain, null));
    }

    @Transactional(readOnly = true)
    public Page<StoreResponse> searchStoresPaged(
            SearchScope scope, String keyword, String sort, int page, int size, Double lat, Double lng) {
        return searchStoresPage(keyword, sort, page, size, lat, lng, scope);
    }

    private Page<StoreResponse> searchStoresPage(
            String keyword, String sort, int page, int size, Double lat, Double lng, SearchScope scope) {
        Pageable pageable = PageRequests.bounded(page, size);
        return sortedSearch(keyword, sort, pageable, lat, lng, scope.domain(), scope.region());
    }

    public record SearchScope(String domain, String region) {}

    private Page<StoreResponse> sortedSearch(
            String keyword, String sort, Pageable pageable, Double lat, Double lng, String domain, String region) {
        return directory().search(keyword, sort, pageable, lat, lng, domain, region);
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
                .getContent();
    }

    /** 현재 가게가 실제로 있는 시도·시군구만 모아 인기 지역과 계층 목록에 공유한다. */
    @Transactional(readOnly = true)
    public List<StoreRegionGroup> getAvailableRegions() {
        return directory().getAvailableRegions();
    }
}
