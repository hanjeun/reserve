package kr.it.reserve.reservation.service;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.dto.ReservationSearchDto;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.reservation.util.ReservationCodeGenerator;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final PaymentService paymentService;
    private final EmailService emailService;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final QrCheckinTokenProvider qrCheckinTokenProvider;

    public ReservationService(
            ReservationRepository reservationRepository,
            StoreRepository storeRepository,
            @Lazy PaymentService paymentService,
            EmailService emailService,
            MemberRepository memberRepository,
            @Lazy AuditLogService auditLogService,
            QrCheckinTokenProvider qrCheckinTokenProvider) {
        this.reservationRepository = reservationRepository;
        this.storeRepository = storeRepository;
        this.paymentService = paymentService;
        this.emailService = emailService;
        this.memberRepository = memberRepository;
        this.auditLogService = auditLogService;
        this.qrCheckinTokenProvider = qrCheckinTokenProvider;
    }

    /**
     * 예약 생성
     */
    @Transactional
    public ReservationResponse createReservation(ReservationCreateRequest request, Member member) {
        log.info("Reservation created: storeId={}, memberId={}", request.getStoreId(), member.getId());

        // 정지 체크 — JWT 크레임에는 status가 없으므로 DB에서 fresh 조회
        Member freshMember = memberRepository.findById(member.getId())
                .orElseThrow(() -> new ReservationException("회원 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (freshMember.isSuspended()) {
            throw new ReservationException("계정이 정지된 상태입니다. 예약을 진행할 수 없습니다.", HttpStatus.FORBIDDEN);
        }
        if (!freshMember.isTermsAgreed()) {
            throw new ReservationException("서비스 이용 약관에 동의해야 예약할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        // 비관적 락으로 조회 — 이 store row에 대한 동시 예약 요청을 트랜잭션 종료까지 순차화해서
        // 아래 잔여 인원 체크(check) → 저장(act) 사이의 레이스 컨디션(오버부킹)을 막는다.
        Store store = storeRepository.findByIdForUpdate(request.getStoreId())
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 가게 주인이 정지된 경우 신규 예약 차단
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게입니다. 신규 예약을 받지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        // 나중 결제 허용 검증: allowLatePayment=false + 예약금 있으면 즉시 결제 필수
        boolean hasDeposit = store.getNoShowDeposit() != null && store.getNoShowDeposit() > 0;
        if (hasDeposit && !Boolean.TRUE.equals(store.getAllowLatePayment())) {
            // request에 skipPayment 플래그가 있으면(=나중 결제 시도) 거부
            if (Boolean.TRUE.equals(request.getSkipPayment())) {
                throw new ReservationException(
                        "이 가게는 나중 결제를 허용하지 않습니다. 예약금을 즉시 결제해주세요.",
                        HttpStatus.BAD_REQUEST
                );
            }
        }

        // 슬롯 검증(날짜/시간/인원 유효성 + 브레이크타임·영업시간·마감·중복·정원) — 생성/수정 공용.
        // 생성이므로 제외할 기존 예약이 없어 excludeReservationId = null.
        validateReservationSlot(store, member,
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
                .member(member)
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

        // 사장님에게 새 예약 알림 (비동기) — 이메일 알림 설정 ON일 때만
        if (Boolean.TRUE.equals(store.getEmailNotificationEnabled())) {
            try {
                String ownerEmail = store.getOwner().getEmail();
                String ownerName  = store.getOwner().getName() != null ? store.getOwner().getName() : "사장님";
                emailService.sendNewReservationAlertToOwner(
                        ownerEmail, ownerName, store.getName(),
                        freshMember.getName(), freshMember.getEmail(),
                        request.getReservationDate().toString(),
                        request.getReservationTime().toString().substring(0, 5),
                        request.getGuestCount()
                );
            } catch (Exception e) {
                log.warn("Owner reservation notification email failed (service continues): {}", e.getMessage());
            }
        } else {
            log.debug("사장님 이메일 알림 비활성화 상태 — 발송 건너뜀");
        }

        return response;
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
        LocalDateTime reservationDateTime = LocalDateTime.of(date, time);
        LocalDateTime now = LocalDateTime.now();

        if (reservationDateTime.isBefore(now)) {
            throw new ReservationException("예약 날짜/시간은 현재 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }

        // 예약 마감 시간 검증 (예약 시간 N시간 전까지만 예약 가능)
        if (store.getBookingDeadlineHours() != null && store.getBookingDeadlineHours() > 0) {
            LocalDateTime deadline = reservationDateTime.minusHours(store.getBookingDeadlineHours());
            if (now.isAfter(deadline)) {
                throw new ReservationException(
                    "예약 마감 시간이 지났습니다. 예약 시간 " + store.getBookingDeadlineHours() + "시간 전까지만 예약 가능합니다.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        // 브레이크 타임 검증 (breakStartTime 이상, breakEndTime 미만은 예약 불가)
        if (store.getBreakStartTime() != null && store.getBreakEndTime() != null) {
            if (!time.isBefore(store.getBreakStartTime()) && time.isBefore(store.getBreakEndTime())) {
                String breakStr = store.getBreakStartTime().toString().substring(0, 5)
                    + " ~ " + store.getBreakEndTime().toString().substring(0, 5);
                throw new ReservationException(
                    "브레이크 타임(" + breakStr + ") 중에는 예약이 불가합니다. 다른 시간대를 선택해주세요.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        // 영업시간 검증 — getAvailability와 동일한 기준: 예약 시각은 [open, close - slotMin] 범위 안이어야 함.
        // (프론트 슬롯 목록에 안 떴는 시각을 API로 직접 찔러넣는 우회 차단)
        if (store.getOpenTime() != null && store.getCloseTime() != null) {
            int slotMin = store.getReservationSlotMinutes() != null ? store.getReservationSlotMinutes() : 30;
            LocalTime lastSlot = store.getCloseTime().minusMinutes(slotMin);
            if (time.isBefore(store.getOpenTime()) || time.isAfter(lastSlot)) {
                String hoursStr = store.getOpenTime().toString().substring(0, 5)
                    + " ~ " + store.getCloseTime().toString().substring(0, 5);
                throw new ReservationException(
                    "영업시간(" + hoursStr + ") 내의 예약 가능한 시간대를 선택해주세요.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        // 중복 예약 방지: 가게 정책에 따라 같은 날짜 활성 예약 여부 확인 (수정 시 자기 자신은 제외)
        if (!Boolean.TRUE.equals(store.getAllowDuplicateReservation())) {
            boolean isDuplicate = (excludeReservationId == null)
                    ? reservationRepository.existsActiveReservationByMemberAndStoreAndDate(
                            member.getId(), store.getId(), date)
                    : reservationRepository.existsActiveReservationByMemberAndStoreAndDateExcluding(
                            member.getId(), store.getId(), date, excludeReservationId);
            if (isDuplicate) {
                throw new ReservationException(
                        "이미 해당 날짜에 예약이 존재합니다. 같은 날 중복 예약은 불가합니다.",
                        HttpStatus.CONFLICT
                );
            }
        }

        // 동시간대 인원 체크 (수정 시 자기 자신의 기존 인원은 제외)
        int currentGuests = (excludeReservationId == null)
                ? reservationRepository.sumActiveGuestsBySlot(store.getId(), date, time)
                : reservationRepository.sumActiveGuestsBySlotExcluding(store.getId(), date, time, excludeReservationId);
        // ★ `!= null` 만 보면 안 된다 — 0 이하는 이 필드에서 **무제한**을 뜻한다(2026-08-09).
        //   아래 getAvailableSlots 의 `capacity <= 0` 분기가 이미 그렇게 해석하고 있어서,
        //   여기서만 null 만 거르면 조회는 "전부 예약 가능", 예약은 "항상 마감"으로
        //   **서로 반대로 판정**한다. 사용자에겐 전 시간대가 열려 보이는데 누르면 전부 마감 에러가 난다.
        //   신규 저장은 StoreService.normalizeCapacity 가 null 로 통일하지만,
        //   이미 0 이 들어간 기존 데이터가 있을 수 있어 읽는 쪽에서도 방어한다.
        if (store.getMaxCapacityPerSlot() != null && store.getMaxCapacityPerSlot() > 0) {
            int remaining = store.getMaxCapacityPerSlot() - currentGuests;
            if (remaining <= 0) {
                throw new ReservationException(
                        "해당 시간대 예약이 마감되었습니다. (" + currentGuests + "/" + store.getMaxCapacityPerSlot() + "명 마감) 다른 시간대를 선택해주세요.",
                        HttpStatus.CONFLICT
                );
            }
            if (guestCount > remaining) {
                throw new ReservationException(
                        "선택하신 인원(" + guestCount + "명)이 남은 자리(" + remaining + "명)를 초과합니다.",
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
    public List<SlotAvailabilityResponse> getAvailability(Long storeId, LocalDate date) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        if (store.getOpenTime() == null || store.getCloseTime() == null) {
            return List.of();
        }

        int slotMin = store.getReservationSlotMinutes() != null ? store.getReservationSlotMinutes() : 30;
        LocalTime open  = store.getOpenTime();
        LocalTime close = store.getCloseTime();
        LocalTime breakStart = store.getBreakStartTime();
        LocalTime breakEnd   = store.getBreakEndTime();
        boolean hasBreak = breakStart != null && breakEnd != null;
        Integer capacity = store.getMaxCapacityPerSlot();

        Map<LocalTime, Long> guestSumByTime = reservationRepository
                .sumActiveGuestsGroupedByTime(storeId, date).stream()
                .collect(Collectors.toMap(
                        row -> (LocalTime) row[0],
                        row -> ((Number) row[1]).longValue()
                ));

        List<SlotAvailabilityResponse> result = new ArrayList<>();
        LocalTime cursor = open;
        // close는 "영업 종료 시각"이므로, 예약이 예약 단위(slotMin)만큼 자리를 점유한다고 보고
        // 마지막 슬롯 + slotMin 이 close를 넘어가면 제외한다.
        // 예) 09:00~21:00, 30분 단위 → 마지막 슬롯 20:30(20:30+30=21:00, 종료와 일치), 21:00 슬롯은 21:30이 되어 제외.
        // (close가 자정을 넘어가는 가게는 LocalTime wrap-around로 정상 처리 안 되지만, 이는 기존 코드도 동일한 한계)
        // ★ slotMin 이 0 이면 cursor 가 전진하지 않아 **무한루프 + result 무한 증가(OOM)** 가 된다.
        //   저장 시 StoreService.clampSlotMinutes 가 막지만, 그 전에 저장된 데이터나 수동 DB 변경이
        //   있을 수 있어 **읽는 쪽에도 가드를 둔다**. 이 경로는 로그인만 하면 누구나 호출할 수 있다.
        if (slotMin <= 0) {
            log.warn("Invalid reservationSlotMinutes: storeId={}, value={} - returning empty slots",
                    store.getId(), slotMin);
            return result;
        }

        while (!cursor.plusMinutes(slotMin).isAfter(close)) {
            boolean inBreak = hasBreak && !cursor.isBefore(breakStart) && cursor.isBefore(breakEnd);
            if (!inBreak) {
                long booked = guestSumByTime.getOrDefault(cursor, 0L);
                boolean available = capacity == null || capacity <= 0 || booked < capacity;
                result.add(new SlotAvailabilityResponse(cursor.toString().substring(0, 5), available));
            }
            cursor = cursor.plusMinutes(slotMin);
        }
        return result;
    }

    /**
     * 예약 상세 조회
     */
    @Transactional(readOnly = true)
    public ReservationResponse getReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);
        return ReservationResponse.fromEntity(reservation);
    }

    /**
     * 예약 수정 (사용자용)
     *
     * 정책:
     * - PENDING(승인 전): 자유롭게 수정.
     * - CONFIRMED(승인 후, 미결제): 수정 허용하되 내용이 바뀌므로 다시 PENDING으로 되돌려 사장님 재승인을 받는다.
     *   (예약금 없음 + 자동 승인 ON인 가게는 생성과 동일하게 즉시 CONFIRMED로 자동 승인)
     * - 이미 결제된 예약: 수정 불가 → 취소 후 재예약으로 유도(결제 정합성 보호).
     * - COMPLETED/REJECTED/CANCELLED/NO_SHOW: 종료 상태라 수정 불가.
     *
     * status 필드는 사용자가 임의로 바꿀 수 없도록 요청에서 무시하고 서버가 위 규칙대로 결정한다.
     */
    @Transactional
    public ReservationResponse updateReservation(Long id, ReservationUpdateRequest request, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);

        Reservation.ReservationStatus current = reservation.getStatus();
        boolean editableStatus = current == Reservation.ReservationStatus.PENDING
                || current == Reservation.ReservationStatus.CONFIRMED;
        if (!editableStatus) {
            throw new ReservationException("완료·취소·거절·노쇼된 예약은 변경할 수 없습니다.", HttpStatus.BAD_REQUEST);
        }

        // 결제된 예약은 수정 불가 — 취소 후 재예약으로 유도(부분 환불/재결제 정합성 보호)
        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new ReservationException(
                    "이미 결제된 예약은 변경할 수 없습니다. 취소 후 다시 예약해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 슬롯 재검증을 위해 가게를 비관적 락으로 조회 (생성과 동일하게 오버부킹 레이스 차단)
        Store store = storeRepository.findByIdForUpdate(reservation.getStore().getId())
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 운영 중단된 가게로는 예약을 옮길 수 없음
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게입니다. 예약을 변경할 수 없습니다.", HttpStatus.BAD_REQUEST);
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

        // 재승인 정책: 내용이 바뀌었으니 CONFIRMED였던 예약도 PENDING으로 되돌려 사장님이 다시 확인하게 한다.
        // 단, 예약금 없음 + 자동 승인 ON인 가게는 생성과 동일하게 즉시 CONFIRMED로 자동 승인.
        // NOTE: 재승인 알림 메일은 현재 범위에서 제외 — 필요해지면 approveReservation과 동일한 패턴으로 추가.
        boolean hasDeposit = store.getNoShowDeposit() != null && store.getNoShowDeposit() > 0;
        Reservation.ReservationStatus newStatus =
                Boolean.TRUE.equals(store.getAutoApprovalEnabled()) && !hasDeposit
                        ? Reservation.ReservationStatus.CONFIRMED
                        : Reservation.ReservationStatus.PENDING;
        reservation.setStatus(newStatus);

        log.info("Reservation updated: id={}, memberId={}, newStatus={}", id, member.getId(), newStatus);
        return ReservationResponse.fromEntity(reservationRepository.save(reservation));
    }

    /**
     * 예약 취소 (사용자용)
     */
    @Transactional
    public void cancelReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);

        if (reservation.getStatus() == Reservation.ReservationStatus.CANCELLED) {
            throw new ReservationException("이미 취소된 예약입니다.", HttpStatus.BAD_REQUEST);
        }

        // ★ 환불 실패가 취소를 막지 않는다 (2026-08-09).
        //   예전엔 환불을 먼저 부르고 그 다음에 CANCELLED 를 세팅했다. PG 가 에러를 주면
        //   트랜잭션이 통째로 롤백돼 사용자는 500 만 보고 예약은 그대로 남았다.
        //   실제로 PortOne 이 404 를 돌려주던 동안 예약금 결제 고객은 취소를 아예 못 했다.
        //   취소는 사용자의 권리이고 PG 장애로 막혀서는 안 된다. 환불은 별도 트랜잭션
        //   (refundByReservationCancel 의 REQUIRES_NEW)에서 시도하고, 실패하면 로그로 남긴다.
        //   ⚠️ 아직 환불 재시도 원장이 없다 — 아래 ERROR 로그가 유일한 추적 수단이다.
        //      운영에서 이 로그가 뜨면 포트원 콘솔에서 수동 취소해야 한다.
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);

        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            try {
                paymentService.refundByReservationCancel(id);
            } catch (Exception e) {
                log.error("Refund failed while cancelling - reservation stays CANCELLED, refund needs manual action: reservationId={}",
                        id, e);
            }
        }
    }

    /**
     * QR 체크인용 토큰 발급 (사용자용) — 본인 예약만 발급 가능
     */
    @Transactional(readOnly = true)
    public String generateQrCheckinToken(Long reservationId, Member member) {
        Reservation reservation = findByIdOrThrow(reservationId);
        validateOwnership(reservation, member);
        return qrCheckinTokenProvider.generateToken(reservationId, reservation.getReservationDate());
    }

    /**
     * QR 스캔을 통한 자동 체크인 (사업자용) — 스캔 즉시 CONFIRMED로 자동 승인.
     * 이미 CONFIRMED인 예약을 재스캔해도 에러 대신 그대로 성공 처리(idempotent)해서
     * 같은 QR을 여러 번 스캔해도 문제없음. CANCELLED/REJECTED/COMPLETED/NO_SHOW는 거부.
     */
    @Transactional
    public ReservationResponse checkInByQrToken(String token, Member owner) {
        Long reservationId = qrCheckinTokenProvider.parseReservationId(token);
        Reservation reservation = findByIdOrThrow(reservationId);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() == Reservation.ReservationStatus.CONFIRMED) {
            return ReservationResponse.fromEntity(reservation);
        }
        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException(
                    "대기 중인 예약만 QR 체크인이 가능합니다. (현재 상태: " + reservation.getStatus() + ")",
                    HttpStatus.BAD_REQUEST
            );
        }

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);

        // 유저에게 승인 알림 (약연 — approveReservation과 동일한 패턴)
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
                log.warn("QR 체크인 승인 알림 이메일 발송 실패: {}", e.getMessage());
            }
        }

        return ReservationResponse.fromEntity(reservation);
    }

    /**
     * 예약 승인 (사업자용)
     */
    @Transactional
    public void approveReservation(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 승인 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);

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
                log.warn("예약 승인 알림 이메일 발송 실패: {}", e.getMessage());
            }
        }
    }

    /**
     * 예약 거절 (사업자용)
     */
    @Transactional
    public void rejectReservation(Long id, Member owner, String reason) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 거절 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.REJECTED);
        reservation.setRejectionReason(reason != null ? reason : "가게 사정으로 인한 거절");

        // ★ 거절은 전액 환불이다 (2026-08-11 추가).
        //   그 전까지 이 메서드에는 환불 호출이 **한 줄도 없었다**. 예약금을 낸 이용자의 예약을
        //   가게가 거절하면 상태만 REJECTED 로 바뀌고 돈은 가게에 남았다. 이용약관
        //   (frontend/src/pages/policy/Terms.jsx)이 "가게 사정에 의한 취소는 전액 환불"이라고
        //   명시하고 있으므로 약관 위반이었고, 이용자가 되돌릴 수단도 없었다.
        //   ⚠️ 정책 계산(calculateRefundAmount)을 쓰면 안 된다 — 그건 이용자 귀책 취소의 위약금
        //      규칙이라, 가게가 당일에 거절해도 0원이 나올 수 있다. 전액 경로를 따로 쓴다.
        //   실패해도 거절은 유지한다(cancelReservation 과 같은 이유).
        refundFullByStoreDecisionQuietly(id, "가게의 예약 거절에 따른 전액 환불", reservation);

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
                log.warn("Reservation rejection email failed: {}", e.getMessage());
            }
        }
    }

    /**
     * 예약 취소 (사업자용) — <b>확정된 예약을 가게가 취소한다. 전액 환불.</b> (2026-08-11 신설)
     *
     * <h3>왜 만들었나</h3>
     * 그 전까지 가게에는 <b>예약을 취소할 수단이 아예 없었다.</b>
     * {@link #cancelReservation} 은 {@code validateOwnership} 을 타서 예약자 본인만 통과하고
     * 가게 주인은 403 이다. 그래서 사장님이 갑자기 문을 닫아야 할 때 할 수 있는 게
     * "노쇼 처리"밖에 없었고, 그건 오지 않은 손님을 벌하는 상태라 사실과 정반대로 기록된다.
     *
     * <h3>왜 CONFIRMED 만인가</h3>
     * PENDING 은 이미 {@link #rejectReservation}(거절)이 담당한다. 같은 일을 하는 버튼이
     * 두 개면 사장님이 무엇을 눌러야 할지 모르고, 기록도 REJECTED/CANCELLED 로 갈린다.
     * 상태별로 정확히 하나의 종료 경로만 둔다.
     *
     * <h3>환불</h3>
     * 가게 귀책이므로 <b>정책 무시하고 전액</b>이다({@code refundFullByStoreDecision}).
     * 사유는 {@code cancelReason} 에 넣는다 — {@code rejectionReason} 을 재사용하면
     * 화면이 "거절 사유"라는 라벨로 보여줘 이용자가 오해한다.
     */
    @Transactional
    public void cancelReservationByStore(Long id, Member owner, String reason) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException(
                    "승인된 예약만 취소할 수 있습니다. 대기 중인 예약은 '거절'을 사용해주세요.",
                    HttpStatus.BAD_REQUEST);
        }

        String cancelReason = (reason != null && !reason.isBlank()) ? reason : "가게 사정으로 인한 취소";

        // cancelReservation 과 같은 순서 — 상태를 먼저 확정하고 환불은 별도 트랜잭션에서 시도한다.
        // PG 장애가 예약 취소 자체를 막으면 사장님도 이용자도 아무것도 못 하는 상태로 갇힌다.
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        reservation.setCancelReason(cancelReason);

        refundFullByStoreDecisionQuietly(id, "가게의 예약 취소에 따른 전액 환불", reservation);

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
                log.warn("Store cancellation email failed: {}", e.getMessage());
            }
        }

        log.info("Reservation cancelled by store: id={}, ownerId={}", id, owner.getId());
    }

    /**
     * 가게 측 결정에 따른 전액 환불을 <b>실패해도 흐름을 막지 않게</b> 실행한다.
     *
     * <p>거절·취소 양쪽에서 같은 규칙이 필요해 뽑아냈다. 결제하지 않은 예약은 건너뛴다.
     *
     * <p>★ <b>성공하면 여기서도 예약금 플래그를 지워야 한다</b> (2026-08-11).
     * 환불은 {@code REQUIRES_NEW} 라 <b>다른 영속성 컨텍스트</b>에서 돈다. 그쪽에서
     * {@code reservation.setDepositPaid(false)} 를 해도 그건 그 컨텍스트가 로드한 <b>다른 인스턴스</b>다.
     * 이 메서드를 부른 트랜잭션은 status 를 바꿔놨으니 커밋 때 UPDATE 를 날리는데,
     * 이 엔티티들엔 {@code @DynamicUpdate} 가 없어 <b>모든 컬럼을 다시 쓴다</b> —
     * 방금 false 로 만든 {@code deposit_paid} 가 true 로 되돌아간다.
     * 그래서 바깥 인스턴스에도 같은 값을 적용해 커밋이 올바른 값을 쓰게 한다.
     * (전액 환불이라 조건 없이 0으로 만든다 — 부분 환불이면 이렇게 하면 안 된다.)
     *
     * <p>★ <b>반환값을 봐야 한다. "예외가 안 났다" ≠ "돈이 돌아갔다".</b>
     * 환불할 PAID 결제가 없으면 그쪽은 조용히 {@code false} 를 준다. 그걸 성공으로 읽고
     * 플래그를 지우면, 이미 부분 환불돼 있던 예약에서 <b>남은 금액을 안 돌려준 채</b>
     * "전액 환불 완료"로 기록되고 고객에게는 전액 환불 메일까지 나간다.
     * 플래그를 지우는 건 <b>실제로 환불이 일어났을 때뿐</b>이다 —
     * {@code depositPaid} 가 true 로 남아 있으면 최소한 "정산이 안 끝난 건"으로 눈에 띈다.
     *
     * <p>⚠️ 환불 재시도 원장이 아직 없다 — 아래 로그가 유일한 추적 수단이고,
     * 운영에서 이 로그가 뜨면 포트원 콘솔에서 수동 처리해야 한다.
     */
    private void refundFullByStoreDecisionQuietly(Long reservationId, String reason, Reservation reservation) {
        if (!Boolean.TRUE.equals(reservation.getDepositPaid())) {
            return;
        }
        try {
            if (paymentService.refundFullByStoreDecision(reservationId, reason)) {
                reservation.setDepositPaid(false);
                reservation.setDepositAmount(0);
            } else {
                log.error("Deposit marked paid but no refundable payment found - needs manual settlement: reservationId={}",
                        reservationId);
            }
        } catch (Exception e) {
            log.error("Store-side full refund failed - status change kept, refund needs manual action: reservationId={}",
                    reservationId, e);
        }
    }

    /**
     * 이용완료 처리 (사업자용)
     */
    @Transactional
    public void completeReservation(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("승인된 예약만 이용완료 처리가 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
    }

    /**
     * 노쇼 처리 (사업자용)
     */
    @Transactional
    public void markNoShow(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("승인된 예약만 노쇼 처리가 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);
    }

    /**
     * 예약 검색 및 목록 조회 (사업자용)
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> searchReservations(Long storeId, ReservationSearchDto searchDto, Member owner) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        if (!store.getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("본인 가게의 예약만 조회 가능합니다.", HttpStatus.FORBIDDEN);
        }

        Pageable pageable = PageRequest.of(searchDto.getPage(), searchDto.getSize());
        return reservationRepository.findByStoreOrderByReservationDateDescReservationTimeDesc(store, pageable)
                .map(ReservationResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getMyReservations(Member member) {
        List<Reservation> reservations = reservationRepository.findByMemberOrderByCreatedAtDesc(member);

        // COMPLETED 예약 ID만 모아서 리뷰 ID를 IN 쿼리 1번으로 조회 (N+1 방지)
        List<Long> completedIds = reservations.stream()
                .filter(r -> r.getStatus() == Reservation.ReservationStatus.COMPLETED)
                .map(Reservation::getId)
                .collect(Collectors.toList());

        Map<Long, Long> reviewIdByReservationId = new java.util.HashMap<>();
        if (!completedIds.isEmpty()) {
            reservationRepository.findReviewIdsByReservationIds(completedIds)
                    .forEach(row -> reviewIdByReservationId.put((Long) row[0], (Long) row[1]));
        }

        return reservations.stream()
                .map(r -> {
                    Long reviewId = reviewIdByReservationId.get(r.getId());
                    return reviewId != null
                            ? ReservationResponse.fromEntityWithReviewId(r, reviewId)
                            : ReservationResponse.fromEntity(r);
                })
                .collect(Collectors.toList());
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
     * 사업자/관리자 - 가게 예약 목록 조회 (최신순)
     * - ADMIN: 페이지네이션 지원 (기본 100건/페이지)
     * - BUSINESS: 본인 소유 가게 예약 (fetch join + 단일 쿼리)
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> getStoreReservations(Member owner, int page, int size) {
        int safeSize = Math.min(size, 100); // 최대 100건으로 고정
        Pageable pageable = PageRequest.of(page, safeSize);
        if (owner.isAdmin()) {
            return reservationRepository.findAllWithStoreAndMemberPaged(pageable)
                    .map(ReservationResponse::fromEntity);
        }
        // BUSINESS: owner 기준으로 가게-예약 한 번에 조회
        return reservationRepository.findByStoreOwnerOrderByCreatedAtDesc(owner, pageable)
                .map(ReservationResponse::fromEntity);
    }

    /**
     * 예약 목록에서 숨기기 (소프트 삭제)
     * 사용자/사업자가 완료·취소·거절·노쇼 예약을 목록에서 제거
     */
    @Transactional
    public void removeReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);

        // 사용자 본인 또는 가게 사장님만 가능
        boolean isOwner = reservation.getMember().getId().equals(member.getId());
        boolean isStoreOwner = reservation.getStore().getOwner().getId().equals(member.getId());
        if (!isOwner && !isStoreOwner && !member.isAdmin()) {
            throw new ReservationException("해당 예약에 대한 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }

        // 진행 중인 예약은 삭제 불가
        Reservation.ReservationStatus status = reservation.getStatus();
        boolean isDeletable = status == Reservation.ReservationStatus.CANCELLED
                || status == Reservation.ReservationStatus.REJECTED
                || status == Reservation.ReservationStatus.COMPLETED
                || status == Reservation.ReservationStatus.NO_SHOW;

        if (!isDeletable) {
            throw new ReservationException("완료·취소·거절·노쇼 상태의 예약만 삭제할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.softDelete();
        auditLogService.logReservationDelete(reservation);  // 관리자 휴지통에 기록 (삭제 주체 = 현재 로그인 유저)
        log.info("Reservation removed: id={}, memberId={}", id, member.getId());
    }

    // ========== 내부 도우미 메서드 ==========

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

    private Reservation findByIdOrThrow(Long id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private void validateOwnership(Reservation reservation, Member member) {
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReservationException("해당 예약에 대한 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
    }

    private void validateStoreOwner(Reservation reservation, Member owner) {
        if (owner.isAdmin()) return; // 관리자는 모든 예약 접근 가능
        if (!reservation.getStore().getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("가게 소유자만 접근 가능합니다.", HttpStatus.FORBIDDEN);
        }
    }
}
