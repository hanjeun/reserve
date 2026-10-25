package kr.it.reserve.reservation.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.RefundDispatchService;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.admission.ReservationCreationGuard;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.QrCheckinResponse;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.dto.ReservationSearchDto;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.dto.ReservationStatusSummaryResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.reservation.util.ReservationCodeGenerator;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ReservationService {

    private static final String STORE_NOT_FOUND_MESSAGE = "가게를 찾을 수 없어요.";
    private static final String RESERVATION_NOT_FOUND_MESSAGE = "예약을 찾을 수 없어요.";

    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    /** 달력을 빨갛게 칠하는 용도. 죽어도 예약 판정에는 영향이 없다(HolidayService 주석 참고). */
    private final ReservationAvailability availability;
    private final PaymentService paymentService;
    @Autowired
    private RefundDispatchService refundDispatch;
    private final EmailService emailService;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final QrCheckinTokenProvider qrCheckinTokenProvider;
    private final ReservationCreationGuard creationGuard;
    @PersistenceContext
    private EntityManager reservationEntityManager;
    @Autowired(required = false)
    private ReservationUpdates updates;

    /** Undo 허용 시간(분). 토스트가 떠 있는 몇 초보다 넉넉하되, 실수 정정 범위를 넘지 않는 값. */
    private static final int UNDO_WINDOW_MINUTES = 10;

    public ReservationService(
            ReservationRepository reservationRepository,
            StoreRepository storeRepository,
            HolidayService holidayService,
            @Lazy PaymentService paymentService,
            EmailService emailService,
            MemberRepository memberRepository,
            @Lazy AuditLogService auditLogService,
            QrCheckinTokenProvider qrCheckinTokenProvider,
            ReservationCreationGuard creationGuard) {
        this.reservationRepository = reservationRepository;
        this.storeRepository = storeRepository;
        this.availability = new ReservationAvailability(reservationRepository, storeRepository, holidayService);
        this.paymentService = paymentService;
        this.emailService = emailService;
        this.memberRepository = memberRepository;
        this.auditLogService = auditLogService;
        this.qrCheckinTokenProvider = qrCheckinTokenProvider;
        this.creationGuard = creationGuard;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 30)
    public ReservationResponse createReservation(ReservationCreateRequest request, Member member) {
        log.info("Reservation created: storeId={}, memberId={}", request.getStoreId(), member.getId());

        // 정지 체크 — JWT 크레임에는 status가 없으므로 DB에서 fresh 조회
        Member freshMember = memberRepository.findActiveByIdForUpdate(member.getId())
                .orElseThrow(() -> new ReservationException("회원 정보를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (freshMember.isSuspended()) {
            throw new ReservationException("계정이 정지된 상태예요. 예약을 진행할 수 없어요.", HttpStatus.FORBIDDEN);
        }
        if (!freshMember.isTermsAgreed()) {
            throw new ReservationException("서비스 이용 약관에 동의해야 예약할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        var attempt = creationGuard.begin(request, freshMember.getId());
        if (attempt.replayReservationId() != null) {
            Reservation prior = reservationRepository.findById(attempt.replayReservationId())
                    .filter(r -> r.getMember().getId().equals(freshMember.getId()))
                    .orElseThrow(() -> new ReservationException("기존 예약을 확인할 수 없어요.", HttpStatus.CONFLICT));
            return ReservationResponse.fromEntity(prior);
        }

        // 비관적 락으로 조회 — 이 store row에 대한 동시 예약 요청을 트랜잭션 종료까지 순차화해서
        // 아래 잔여 인원 체크(check) → 저장(act) 사이의 레이스 컨디션(오버부킹)을 막는다.
        Store store = storeRepository.findByIdForUpdate(request.getStoreId())
                .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));

        if (store.isDeleted()) {
            throw new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
        }
        if (store.isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게예요. 신규 예약을 받지 않아요.", HttpStatus.BAD_REQUEST);
        }

        // 가게 주인이 정지된 경우 신규 예약 차단
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게예요. 신규 예약을 받지 않아요.", HttpStatus.BAD_REQUEST);
        }

        // 나중 결제 허용 검증: allowLatePayment=false + 예약금 있으면 즉시 결제 필수
        boolean hasDeposit = store.getNoShowDeposit() != null && store.getNoShowDeposit() > 0;
        if (hasDeposit && !Boolean.TRUE.equals(store.getAllowLatePayment())
                && Boolean.TRUE.equals(request.getSkipPayment())) {
            // request에 skipPayment 플래그가 있으면(=나중 결제 시도) 거부
            throw new ReservationException(
                    "이 가게는 나중 결제를 허용하지 않아요. 예약금을 즉시 결제해주세요.",
                    HttpStatus.BAD_REQUEST
            );
        }

        // 슬롯 검증(날짜/시간/인원 유효성 + 브레이크타임·영업시간·마감·중복·정원) — 생성/수정 공용.
        // 생성이므로 제외할 기존 예약이 없어 excludeReservationId = null.
        validateReservationSlot(store, freshMember,
                request.getReservationDate(), request.getReservationTime(), request.getGuestCount(), null);

        // 자동 승인 여부에 따라 초기 상태 결정
        // - 예약금 없음 + 자동승인 ON → 즉시 CONFIRMED
        // - 예약금 있음 + 자동승인 ON → PENDING 유지, 결제 완료 시 PaymentService에서 CONFIRMED 전환
        // - 자동승인 OFF → 사장님이 수동 승인
        Reservation.ReservationStatus initialStatus =
                Boolean.TRUE.equals(store.getAutoApprovalEnabled()) && !hasDeposit
                        ? Reservation.ReservationStatus.CONFIRMED
                        : Reservation.ReservationStatus.PENDING;

        Reservation reservation = Reservation.builder()
                .member(freshMember)
                .store(store)
                .reservationCode(generateUniqueReservationCode(request.getReservationDate()))
                .reservationDate(request.getReservationDate())
                .reservationTime(request.getReservationTime())
                .guestCount(request.getGuestCount())
                .specialRequest(request.getSpecialRequest())
                .status(initialStatus)
                .depositAmount(store.getNoShowDeposit() != null ? store.getNoShowDeposit() : 0)
                .depositPaid(false)
                .build();

        ReservationResponse response = ReservationResponse.fromEntity(reservationRepository.save(reservation));
        creationGuard.saved(attempt, reservation.getId());
        changed(reservation, EntityUpdates.Operation.CREATED);

        // 사장님에게 새 예약 알림 (비동기) — 이메일 알림 설정 ON일 때만
        notifyOwnerOfNewReservation(store, freshMember, request);

        return response;
    }

    private void notifyOwnerOfNewReservation(Store store, Member member, ReservationCreateRequest request) {
        if (Boolean.TRUE.equals(store.getEmailNotificationEnabled())) {
            try {
                String ownerEmail = store.getOwner().getEmail();
                String ownerName  = store.getOwner().getName() != null ? store.getOwner().getName() : "사장님";
                emailService.sendNewReservationAlertToOwner(
                        ownerEmail, ownerName, member.getName(), member.getEmail(),
                        new EmailService.ReservationMailDetails(store.getName(),
                                request.getReservationDate().toString(),
                                request.getReservationTime().toString().substring(0, 5),
                                request.getGuestCount())
                );
            } catch (Exception e) {
                log.warn("Owner reservation notification email failed (service continues): errorType={}",
                        e.getClass().getSimpleName());
            }
        } else {
            log.debug("Owner reservation notification skipped: email notifications disabled");
        }

    }

    /**
     * 예약 슬롯 검증 (생성·수정 공용).
     * 날짜/시간이 현재 이후인지, 예약 마감·브레이크타임·영업시간 범위 안인지, 중복/정원에 걸리지 않는지 확인한다.
     *
     * @param excludeReservationId 정원·중복 계산에서 제외할 예약 ID. 생성 시엔 null(제외 대상 없음),
     *                             수정 시엔 자기 자신의 ID를 넘겨 "인원을 안 늘렸는데 자기 자신 때문에 마감"으로
     *                             잘못 판정되는 것을 막는다.
     */
    private void validateReservationSlot(Store store, Member member,
                                         LocalDate date, LocalTime time, Integer guestCount,
                                         Long excludeReservationId) {
        if (!store.isReservationEnabled()) {
            throw new ReservationException("현재 이 가게는 예약 접수를 받지 않아요.", HttpStatus.CONFLICT);
        }
        LocalDateTime reservationDateTime = LocalDateTime.of(date, time);
        // 반드시 KST 기준 "지금"이어야 한다. date·time 은 사용자가 고른 한국 시각이고,
        //   컨테이너는 UTC 라 인자 없는 now() 는 9시간 뒤처진다.
        //   그 상태에서는 **이미 지나간 시간대의 예약이 검사를 통과했다**
        //   (예: 14:00 KST 에 오늘 08:00 예약 → UTC 로는 05:00 < 08:00 이라 미래로 보인다).
        LocalDateTime now = ServiceTime.now();

        if (reservationDateTime.isBefore(now)) {
            throw new ReservationException("예약 날짜/시간은 현재 이후여야 해요.", HttpStatus.BAD_REQUEST);
        }

        // 휴무·운영 기간은 Store.isBookableOn에서 판정해 예약·가용 시각·달력이 같은 정책을 사용한다.
        if (!store.isBookableOn(date)) {
            throw new ReservationException(
                    store.isClosedOn(date)
                            ? "휴무일에는 예약할 수 없어요. 다른 날짜를 선택해주세요."
                            : "예약을 받는 기간이 아니에요. 다른 날짜를 선택해주세요.",
                    HttpStatus.BAD_REQUEST);
        }

        validateBookingWindow(store, date, reservationDateTime, now);

        // 브레이크 타임은 SLOT에만 적용한다. 직접 지정한 SESSION 회차와 DAY에는 덧씌우지 않는다.
        if (store.resolveBookingType() == Store.BookingType.SLOT
                && store.getBreakStartTime() != null && store.getBreakEndTime() != null
                && !time.isBefore(store.getBreakStartTime()) && time.isBefore(store.getBreakEndTime())) {
            String breakStr = store.getBreakStartTime().toString().substring(0, 5)
                + " ~ " + store.getBreakEndTime().toString().substring(0, 5);
            throw new ReservationException(
                "브레이크 타임(" + breakStr + ") 중에는 예약할 수 없어요. 다른 시간대를 선택해주세요.",
                HttpStatus.BAD_REQUEST
            );
        }

        // 가용 시각 조회와 같은 목록의 포함 여부를 검사해 격자 밖 시각을 거부한다.
        List<LocalTime> bookable = availability.bookableSlotTimes(store, date);
        if (!bookable.contains(time)) {
            throw new ReservationException(
                bookable.isEmpty()
                    ? "이 날짜에는 예약을 받지 않아요. 다른 날짜를 선택해주세요."
                    : "예약 가능한 시간대를 선택해주세요.",
                HttpStatus.BAD_REQUEST
            );
        }

        validateActiveReservationCapacity(store, member, date, time, guestCount, excludeReservationId);
    }

    /** 생성·수정·미래 완료 복귀가 같은 중복/정원 정책을 사용한다. 호출자는 가게 행을 잠근다. */
    private void validateActiveReservationCapacity(Store store, Member member,
            LocalDate date, LocalTime time, Integer guestCount, Long excludeReservationId) {
        // 중복 예약 방지: 가게 정책에 따라 같은 날짜 활성 예약 여부 확인 (수정 시 자기 자신은 제외)
        if (!Boolean.TRUE.equals(store.getAllowDuplicateReservation())) {
            boolean isDuplicate = (excludeReservationId == null)
                    ? reservationRepository.existsActiveReservationByMemberAndStoreAndDate(
                            member.getId(), store.getId(), date)
                    : reservationRepository.existsActiveReservationByMemberAndStoreAndDateExcluding(
                            member.getId(), store.getId(), date, excludeReservationId);
            if (isDuplicate) {
                throw new ReservationException(
                        "이미 해당 날짜에 예약이 존재해요. 같은 날 중복 예약할 수 없어요.",
                        HttpStatus.CONFLICT
                );
            }
        }

        // 동시간대 인원 체크 (수정 시 자기 자신의 기존 인원은 제외)
        validateSlotCapacity(store, date, time, guestCount, excludeReservationId);
    }

    private void validateBookingWindow(
            Store store, LocalDate date, LocalDateTime reservationDateTime, LocalDateTime now) {
        // 예약 가능 범위 검증.
        //   그 전까지 미래 날짜 제한이 없어 1년 뒤 예약도 들어왔다. 그렇게 먼 예약은 가게가 운영
        //   계획을 세울 수 없고 이용자도 잊어버린다. null = 제한 없음(기존 가게의 동작 유지).
        Integer maxAdvance = store.getMaxAdvanceBookingDays();
        if (maxAdvance != null && maxAdvance > 0) {
            // 사장님이 정한 "오늘부터 N일"의 오늘은 한국 날짜다(ServiceTime 참고).
            LocalDate lastBookable = ServiceTime.today().plusDays(maxAdvance);
            if (date.isAfter(lastBookable)) {
                throw new ReservationException(
                        "이 가게는 " + maxAdvance + "일 이내의 날짜만 예약할 수 있어요.", HttpStatus.BAD_REQUEST);
            }
        }

        // 예약 마감 시간 검증 (예약 시간 N시간 전까지만 예약 가능)
        if (store.getBookingDeadlineHours() != null && store.getBookingDeadlineHours() > 0) {
            LocalDateTime deadline = reservationDateTime.minusHours(store.getBookingDeadlineHours());
            if (now.isAfter(deadline)) {
                throw new ReservationException(
                    "예약 마감 시간이 지났어요. 예약 시간 " + store.getBookingDeadlineHours() + "시간 전까지만 예약할 수 있어요.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

    }

    private void validateSlotCapacity(
            Store store, LocalDate date, LocalTime time, Integer guestCount, Long excludeReservationId) {
        int currentGuests = (excludeReservationId == null)
                ? reservationRepository.sumActiveGuestsBySlot(store.getId(), date, time)
                : reservationRepository.sumActiveGuestsBySlotExcluding(store.getId(), date, time, excludeReservationId);
        // null 또는 0 이하 정원은 무제한이다. 조회와 쓰기가 같은 해석을 사용한다.
        if (store.getMaxCapacityPerSlot() != null && store.getMaxCapacityPerSlot() > 0) {
            int remaining = store.getMaxCapacityPerSlot() - currentGuests;
            if (remaining <= 0) {
                throw new ReservationException(
                        "해당 시간대 예약이 마감됐어요. (" + currentGuests + "/" + store.getMaxCapacityPerSlot() + "명 마감) 다른 시간대를 선택해주세요.",
                        HttpStatus.CONFLICT
                );
            }
            if (guestCount > remaining) {
                throw new ReservationException(
                        "선택하신 인원(" + guestCount + "명)이 남은 자리(" + remaining + "명)를 초과해요.",
                        HttpStatus.CONFLICT
                );
            }
        }
    }

    /**
     * 날짜별 시간대 선택 UI용: 영업시간·브레이크타임과 해당 날짜의 실시간 잔여 인원을 함께 반영해
     * 슬롯별 예약 가능 여부를 내려준다. (정원 기준 미만 시 모든 시간대 available=true)
     */
    @Transactional(readOnly = true)
    public List<SlotAvailabilityResponse> getAvailability(Long storeId, LocalDate date) { return availability.getAvailability(storeId, date); }

    @Transactional(readOnly = true)
    public List<CalendarDayResponse> getMonthCalendar(Long storeId, YearMonth month) { return availability.getMonthCalendar(storeId, month); }

    @Transactional(readOnly = true)
    public ReservationResponse getReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);
        return ReservationResponse.fromEntity(reservation);
    }

    /** 커밋된 결과만 복구하며 입장권 점유·결제·정원 검사·쓰기 잠금은 수행하지 않는다. */
    @Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED)
    public ReservationResponse recoverReservation(ReservationCreateRequest request, Member member) {
        Member current = memberRepository.findByIdAndDeletedAtIsNull(member.getId())
                .filter(m -> !m.isDeleted())
                .orElseThrow(() -> new ReservationException("회원 정보를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        Long id = creationGuard.recover(request, current.getId());
        if (id == null) return null;
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, current);
        if (reservation.isDeleted()) throw new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
        return ReservationResponse.fromEntity(reservation);
    }

    /** 결제된 예약과 종료 상태는 수정할 수 없다. 승인된 미결제 예약은 변경 후 재승인을 받고, 자동 승인은 생성과 같은 조건을 적용한다. 상태는 서버가 결정한다. */
    // 금융 잠금 전 ID 조회의 RR snapshot으로 대기 중 확정된 예약을 놓치지 않는다.
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReservationResponse updateReservation(Long id, ReservationUpdateRequest request, Member member) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        ReservationAccess.editable(reservation, member);

        // 슬롯 재검증을 위해 가게를 비관적 락으로 조회 (생성과 동일하게 오버부킹 레이스 차단)
        Store store = storeRepository.findByIdForUpdate(reservation.getStore().getId())
                .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));

        // 운영 중단된 가게로는 예약을 옮길 수 없음
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게예요. 예약을 변경할 수 없어요.", HttpStatus.BAD_REQUEST);
        }

        // 요청에 담긴 값만 반영, 나머지는 기존값 유지 (status는 무시)
        LocalDate newDate = request.getReservationDate() != null ? request.getReservationDate() : reservation.getReservationDate();
        LocalTime newTime = request.getReservationTime() != null ? request.getReservationTime() : reservation.getReservationTime();
        Integer newGuestCount = request.getGuestCount() != null ? request.getGuestCount() : reservation.getGuestCount();

        // 생성과 동일한 검증 — 단, 자기 자신은 정원/중복 계산에서 제외
        validateReservationSlot(store, member, newDate, newTime, newGuestCount, reservation.getId());

        reservation.setReservationDate(newDate);
        reservation.setReservationTime(newTime);
        reservation.setGuestCount(newGuestCount);
        if (request.getSpecialRequest() != null) {
            reservation.setSpecialRequest(request.getSpecialRequest());
        }

        boolean hasDeposit = store.getNoShowDeposit() != null && store.getNoShowDeposit() > 0;
        Reservation.ReservationStatus newStatus =
                Boolean.TRUE.equals(store.getAutoApprovalEnabled()) && !hasDeposit
                        ? Reservation.ReservationStatus.CONFIRMED
                        : Reservation.ReservationStatus.PENDING;
        reservation.setStatus(newStatus);

        log.info("Reservation updated: id={}, memberId={}, newStatus={}", id, member.getId(), newStatus);
        Reservation saved = reservationRepository.save(reservation);
        changed(saved, EntityUpdates.Operation.UPDATED);
        return ReservationResponse.fromEntity(saved);
    }

    /**
     * 예약 취소 (사용자용)
     */
    @Transactional
    public void cancelReservation(Long id, Member member) {
        Reservation reservation = paymentService.lockReservationPayments(id);
        validateOwnership(reservation, member);

        if (reservation.getStatus() == Reservation.ReservationStatus.CANCELLED) {
            throw new ReservationException("이미 취소된 예약이에요.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        changed(reservation, EntityUpdates.Operation.UPDATED);

        // 취소 결정과 미발신 환불 의도를 함께 커밋한다. PG 오류는 이미 커밋한 취소를 되돌리지 않는다.
        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            refundDispatch.afterCommit(paymentService.prepareRefundByReservationCancel(id));
        }
    }

    /**
     * QR 체크인용 토큰 발급 (사용자용) — 본인 예약만 발급 가능
     */
    @Transactional(readOnly = true)
    public String generateQrCheckinToken(Long reservationId, Member member) {
        return attendance().generateQrCheckinToken(reservationId, member);
    }

    /**
     * QR 스캔을 통한 방문 체크인 (사업자용).
     * 예약 승인 상태는 바꾸지 않고 별도 checkedInAt만 기록한다. 중복 스캔은 멱등 성공한다.
     */
    @Transactional
    public QrCheckinResponse checkInByQrToken(String token, Member owner) {
        return attendance().checkInByQrToken(token, owner);
    }

    /**
     * 예약 승인 (사업자용)
     */
    @Transactional
    public void approveReservation(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 승인할 수 있어요.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
        changed(reservation, EntityUpdates.Operation.UPDATED);

        // 유저에게 승인 알림 (비동기) — 개인 알림 설정 ON일 때만
        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationConfirmedEmail(
                        reservation.getMember().getEmail(),
                        memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount()
                );
            } catch (Exception e) {
                log.warn("Reservation approval email failed: errorType={}", e.getClass().getSimpleName());
            }
        }
    }

    /**
     * 예약 거절 (사업자용)
     */
    @Transactional
    public void rejectReservation(Long id, Member owner, String reason) {
        Reservation reservation = paymentService.lockReservationPayments(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 거절할 수 있어요.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.REJECTED);
        changed(reservation, EntityUpdates.Operation.UPDATED);
        reservation.setRejectionReason(reason != null ? reason : "가게 사정으로 인한 거절");

        // 거절은 전액 환불이다.
        //   그 전까지 이 메서드에는 환불 호출이 **한 줄도 없었다**. 예약금을 낸 이용자의 예약을
        //   가게가 거절하면 상태만 REJECTED 로 바뀌고 돈은 가게에 남았다. 이용약관
        //   (frontend/src/pages/policy/Terms.jsx)이 "가게 사정에 의한 취소는 전액 환불"이라고
        //   명시하고 있으므로 약관 위반이었고, 이용자가 되돌릴 수단도 없었다.
        //   주의: 정책 계산(calculateRefundAmount)을 쓰면 안 된다 — 그건 이용자 귀책 취소의 위약금
        //      규칙이라, 가게가 당일에 거절해도 0원이 나올 수 있다. 전액 경로를 따로 쓴다.
        //   외부 발신은 거절·환불 의도 커밋 후에 실행하므로 PG 오류가 거절을 되돌리지 않는다.
        prepareStoreDecisionRefund(id, "가게의 예약 거절에 따른 전액 환불", reservation);

        // 유저에게 거절 알림 (비동기) — 개인 알림 설정 ON일 때만
        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationRejectedEmail(
                        reservation.getMember().getEmail(),
                        memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount(),
                        reservation.getRejectionReason()
                );
            } catch (Exception e) {
                log.warn("Reservation rejection email failed: errorType={}", e.getClass().getSimpleName());
            }
        }
    }

    /**
     * 가게 소유권과 처리 가능한 예약 상태를 확인한 뒤 가게 사정 취소를 기록한다.
     * 가게 귀책은 전액 환불 경로로 준비하며 외부 호출은 커밋 뒤에 수행한다.
     * 취소 사유는 거절 사유와 구분해 cancelReason에 저장한다.
     */
    @Transactional
    public void cancelReservationByStore(Long id, Member owner, String reason) {
        Reservation reservation = paymentService.lockReservationPayments(id);
        validateStoreOwner(reservation, owner);

        if (!isClosable(reservation)) {
            throw new ReservationException(
                    "승인된 예약만 취소할 수 있어요. 대기 중인 예약은 '거절'을 사용해주세요.",
                    HttpStatus.BAD_REQUEST);
        }

        String cancelReason = (reason != null && !reason.isBlank()) ? reason : "가게 사정으로 인한 취소";

        // 취소 결정과 미발신 의도를 함께 저장한다. 외부 PG 호출은 커밋 후 실행한다.
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        changed(reservation, EntityUpdates.Operation.UPDATED);
        reservation.setCancelReason(cancelReason);

        prepareStoreDecisionRefund(id, "가게의 예약 취소에 따른 전액 환불", reservation);

        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationCancelledByStoreEmail(
                        reservation.getMember().getEmail(),
                        memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount(),
                        cancelReason
                );
            } catch (Exception e) {
                log.warn("Store cancellation email failed: errorType={}", e.getClass().getSimpleName());
            }
        }

        log.info("Reservation cancelled by store: id={}, ownerId={}", id, owner.getId());
    }

    /** 가게 결정·환불 의도를 함께 저장하고 커밋한 원장 ID만 외부 발신에 넘긴다. */
    private void prepareStoreDecisionRefund(Long reservationId, String reason, Reservation reservation) {
        if (!Boolean.TRUE.equals(reservation.getDepositPaid())) return;
        Long attemptId = paymentService.prepareFullRefundByStoreDecision(reservationId, reason);
        if (attemptId == null) {
            log.error("Deposit marked paid but no refundable payment found: reservationId={}", reservationId);
            return;
        }
        refundDispatch.afterCommit(attemptId);
    }

    /** 승인 취소는 결제 상태를 유지하고 다시 대기 상태임을 메일로 알린다. */
    @Transactional
    public void undoApprove(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("승인된 예약만 되돌릴 수 있어요.", HttpStatus.BAD_REQUEST);
        }
        requireWithinUndoWindow(reservation);

        reservation.setStatus(Reservation.ReservationStatus.PENDING);
        changed(reservation, EntityUpdates.Operation.UPDATED);
        log.info("Approval undone: reservationId={}, ownerId={}", id, owner.getId());

        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationApprovalRevokedEmail(
                        reservation.getMember().getEmail(), memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount());
            } catch (Exception e) {
                log.warn("Approval revoked email failed: errorType={}", e.getClass().getSimpleName());
            }
        }
    }

    /** 이용완료를 승인 상태로 되돌린다. 예약 시각이 지났으면 기존 경과 처리 정책을 적용한다. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void undoComplete(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.COMPLETED) {
            throw new ReservationException("이용완료된 예약만 되돌릴 수 있어요.", HttpStatus.BAD_REQUEST);
        }
        requireWithinUndoWindow(reservation);

        if (!LocalDateTime.of(reservation.getReservationDate(), reservation.getReservationTime()).isBefore(ServiceTime.now())) {
            // 금융 잠금의 ID 조회가 만든 이전 RR snapshot을 재사용하지 않도록 이 TX는 READ_COMMITTED다.
            Store store = storeRepository.findByIdForUpdate(reservation.getStore().getId())
                    .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
            // 소유자 검사에서 이미 읽은 가게도 잠금 획득 뒤 최신 상태로 다시 읽는다.
            reservationEntityManager.refresh(store, LockModeType.PESSIMISTIC_WRITE);
            if (store.isDeleted() || reservation.getMember().isDeleted()) {
                throw new ReservationException("종료된 가게나 탈퇴한 회원의 미래 예약은 복구할 수 없어요.", HttpStatus.CONFLICT);
            }
            validateActiveReservationCapacity(store, reservation.getMember(), reservation.getReservationDate(),
                    reservation.getReservationTime(), reservation.getGuestCount(), reservation.getId());
        }

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
        changed(reservation, EntityUpdates.Operation.UPDATED);
        log.info("Completion undone: reservationId={}, ownerId={}", id, owner.getId());
    }

    /** 되돌리기는 정해진 시간 안에서만 허용한다. updatedAt과 같은 JVM 시계로 비교하고 한국 시간으로 치환하지 않는다. */
    private void requireWithinUndoWindow(Reservation reservation) {
        LocalDateTime changedAt = reservation.getUpdatedAt();
        if (changedAt == null || changedAt.isBefore(LocalDateTime.now(Clock.systemDefaultZone()).minusMinutes(UNDO_WINDOW_MINUTES))) {
            throw new ReservationException(
                    "되돌릴 수 있는 시간이 지났어요. 취소 또는 거절을 사용해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 이용완료 처리 (사업자용)
     */
    @Transactional
    public void completeReservation(Long id, Member owner) {
        attendance().completeReservation(id, owner);
    }

    /**
     * 노쇼 처리 (사업자용)
     */
    @Transactional
    public void markNoShow(Long id, Member owner) {
        attendance().markNoShow(id, owner);
    }

    /**
     * 예약 검색 및 목록 조회 (사업자용)
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> searchReservations(Long storeId, ReservationSearchDto searchDto, Member owner) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));

        if (!store.getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("본인 가게의 예약만 조회할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        Pageable pageable = PageRequest.of(searchDto.getPage(), searchDto.getSize());
        return reservationRepository.findByStoreOrderByReservationDateDescReservationTimeDesc(store, pageable)
                .map(ReservationResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public Page<ReservationResponse> getMyReservations(Member member, int page, int size, String search,
            Reservation.ReservationStatus status, String sort) {
        Pageable pageable = PageRequests.bounded(page, size).withSort(reservationManagementSort(sort));
        String keyword = search == null ? "" : search.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_");
        Page<Reservation> reservations = reservationRepository.searchForMember(member, keyword, status, pageable);
        Map<Long, Long> reviews = myReservationReviewIds(reservations.getContent());
        return reservations.map(r -> ReservationResponse.fromEntityWithReviewId(r, reviews.get(r.getId())));
    }

    private Map<Long, Long> myReservationReviewIds(List<Reservation> reservations) {
        // 신규 페이지 API는 반환할 페이지의 COMPLETED ID만 묶어 조회한다.
        List<Long> completedIds = reservations.stream()
                .filter(r -> r.getStatus() == Reservation.ReservationStatus.COMPLETED)
                .map(Reservation::getId)
                .toList();

        Map<Long, Long> reviewIdByReservationId = new HashMap<>();
        if (!completedIds.isEmpty()) {
            reservationRepository.findReviewIdsByReservationIds(completedIds)
                    .forEach(row -> reviewIdByReservationId.put((Long) row[0], (Long) row[1]));
        }

        return reviewIdByReservationId;
    }

    /**
     * 가게 상세 페이지 진입 시 호출: 이 회원이 해당 가게에서 리뷰 작성 가능한(가장 최근 COMPLETED) 예약이 있는지 조회
     * 서버에서 바로 필터링된 1건만 내려보내므로 클라이언트가 내 전체 예약 목록을 불러올 필요가 없음
     */
    @Transactional(readOnly = true)
    public ReservationResponse getLatestCompletedReservationForStore(Member member, Long storeId) {
        return reservationRepository
                .findFirstByMemberIdAndStoreIdAndStatusOrderByIdDesc(member.getId(), storeId, Reservation.ReservationStatus.COMPLETED)
                .map(r -> {
                    Long reviewId = reservationRepository.findReviewIdsByReservationIds(List.of(r.getId())).stream()
                            .findFirst().map(row -> (Long) row[1]).orElse(null);
                    return reviewId != null ? ReservationResponse.fromEntityWithReviewId(r, reviewId) : ReservationResponse.fromEntity(r);
                })
                .orElse(null);
    }

    /**
     * 소유권·가게·검색·상태 필터를 전체 예약에 적용한 뒤 페이지를 반환한다.
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> getStoreReservations(
            Member owner,
            int page,
            int size,
            String search,
            Reservation.ReservationStatus status,
            Long storeId,
            String sort) {
        int safeSize = Math.clamp(size, 1, 100);
        Pageable pageable = PageRequest.of(Math.max(page, 0), safeSize, reservationManagementSort(sort));
        String keyword = search == null ? "" : search.trim();
        if (owner.isAdmin()) {
            return reservationRepository.searchForAdmin(keyword, status, storeId, pageable)
                    .map(ReservationResponse::fromEntity);
        }
        return reservationRepository.searchForStoreOwner(owner, keyword, status, storeId, pageable)
                .map(ReservationResponse::fromEntity);
    }

    /** 예약 관리 세 화면의 정렬 계약. 알 수 없는 값은 기존 동작인 최신순으로 되돌린다. */
    private Sort reservationManagementSort(String value) {
        return switch (value == null ? "recent" : value) {
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt", "id");
            case "visit" -> Sort.by(Sort.Direction.ASC, "reservationDate", "reservationTime", "id");
            default -> Sort.by(Sort.Direction.DESC, "createdAt", "id");
        };
    }

    @Transactional(readOnly = true)
    public ReservationStatusSummaryResponse getStoreReservationSummary(Member owner) {
        List<Object[]> rows = owner.isAdmin()
                ? reservationRepository.countAdminReservationsGroupedByStatus()
                : reservationRepository.countOwnerReservationsGroupedByStatus(owner);
        return ReservationStatusSummaryResponse.fromRows(rows);
    }

    /**
     * 예약 목록에서 숨기기 (소프트 삭제)
     * 사용자/사업자가 완료·취소·거절·노쇼 예약을 목록에서 제거
     */
    @Transactional
    public void removeReservation(Long id, Member member) {
        Reservation reservation = findByIdForUpdateOrThrow(id);

        // 사용자 본인 또는 가게 사장님만 가능
        boolean isOwner = reservation.getMember().getId().equals(member.getId());
        boolean isStoreOwner = reservation.getStore().getOwner().getId().equals(member.getId());
        if (!isOwner && !isStoreOwner && !member.isAdmin()) {
            throw new ReservationException("해당 예약에 대한 권한이 없어요.", HttpStatus.FORBIDDEN);
        }

        // 진행 중인 예약은 삭제 불가
        Reservation.ReservationStatus status = reservation.getStatus();
        boolean isDeletable = status == Reservation.ReservationStatus.CANCELLED
                || status == Reservation.ReservationStatus.REJECTED
                || status == Reservation.ReservationStatus.COMPLETED
                || status == Reservation.ReservationStatus.NO_SHOW;

        if (!isDeletable) {
            throw new ReservationException("완료·취소·거절·노쇼 상태의 예약만 삭제할 수 있어요.", HttpStatus.BAD_REQUEST);
        }

        reservation.softDelete();
        changed(reservation, EntityUpdates.Operation.DELETED);
        auditLogService.logReservationDelete(reservation);  // 관리자 휴지통에 기록 (삭제 주체 = 현재 로그인 유저)
        log.info("Reservation removed: id={}, memberId={}", id, member.getId());
    }

    // 내부 도우미 메서드

    /**
     * unique한 표시용 예약번호 생성 — DB의 unique 제약과 충돌하지 않을 때까지 재시도.
     * 4자리 랜덤(약 100만 조합)이라 같은 날 충돌 확률은 극히 낮지만, 만약을 대비해 몇 번 재생성한다.
     */
    private String generateUniqueReservationCode(LocalDate reservationDate) {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = ReservationCodeGenerator.generate(reservationDate);
            if (!reservationRepository.existsByReservationCode(code)) {
                return code;
            }
        }
        // 극히 드문 연속 충돌 — 타임스탬프 suffix로 확실히 유일하게 만든다.
        return ReservationCodeGenerator.generate(reservationDate) + System.nanoTime() % 1000;
    }

    private ReservationAttendance attendance() {
        return new ReservationAttendance(reservationRepository, qrCheckinTokenProvider, updates,
                paymentService::lockReservationForStateChange);
    }

    private void changed(Reservation reservation, EntityUpdates.Operation operation) {
        if (updates != null) updates.changed(reservation, operation);
    }

    private Reservation findByIdOrThrow(Long id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
    }

    /** 모든 예약 상태 변경이 거치는 행 잠금 관문. QR·취소·완료가 서로 값을 덮어쓰지 않게 한다. */
    private Reservation findByIdForUpdateOrThrow(Long id) {
        paymentService.lockReservationForStateChange(id);
        return reservationRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
    }

    private void validateOwnership(Reservation reservation, Member member) {
        ReservationAccess.member(reservation, member);
    }

    /** 승인 상태와 시간이 지난 미확인 상태의 종료 처리는 같은 정책을 사용한다. */
    private boolean isClosable(Reservation reservation) {
        return ReservationAccess.approved(reservation);
    }

    private boolean isApprovedForCheckIn(Reservation reservation) {
        return ReservationAccess.approved(reservation);
    }

    private void validateStoreOwner(Reservation reservation, Member owner) {
        ReservationAccess.owner(reservation, owner);
    }
}
