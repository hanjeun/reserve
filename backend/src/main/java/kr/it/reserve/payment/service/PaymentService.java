package kr.it.reserve.payment.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final ReservationRepository reservationRepository;
    private final MemberRepository memberRepository;
    private final PortoneService portoneService;
    private final RefundLedgerService refundLedgerService;

    public PaymentPrepareDto preparePayment(PaymentRequestDto requestDto, Long memberId) {
        Reservation reservation = reservationRepository.findById(requestDto.getReservationId())
                .orElseThrow(ReservationException::notFound);

        Member member = memberRepository.findById(memberId)
                .orElseThrow(MemberException::notFound);

        // ★ 본인 예약인지 확인한다 (2026-08-09).
        //   예전엔 reservationId 를 body 에서 받아 그대로 조회만 했다. 로그인만 하면
        //   남의 예약에 대해 결제를 준비하고, 아래 금액 문제와 겹쳐 남의 예약을
        //   임의 금액으로 "결제 완료" 상태로 만들 수 있었다.
        if (reservation.getMember() == null || !reservation.getMember().getId().equals(memberId)) {
            log.warn("Payment prepare denied - not owner: reservationId={}, memberId={}",
                    reservation.getId(), memberId);
            throw new PaymentException("본인의 예약만 결제할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new PaymentException("이미 결제가 완료된 예약입니다.", HttpStatus.CONFLICT);
        }

        // ★ 결제 금액은 서버에서만 정한다 (2026-08-09).
        //   예전엔 requestDto.getAmount() 를 그대로 Payment.amount 에 넣었고,
        //   verifyAndCompletePayment 는 PG 결제액을 "그 값"과 비교했다. 즉 검증이
        //   공격자가 정한 숫자를 기준으로 통과했고, markDepositPaid 가 예약의
        //   예약금을 그 금액으로 덮어썼다. 요청 본문의 amount 는 이제 무시한다.
        int amount = resolveDepositAmount(reservation);
        if (amount <= 0) {
            throw new PaymentException("결제할 예약금이 없는 예약입니다.", HttpStatus.BAD_REQUEST);
        }

        // 기존 READY 상태 Payment가 있으면 재사용 (결제창 재시도 지원)
        // findReadyByReservationId 사용 → 여러 레코드 있어도 안전 (첫 번째만 사용)
        List<Payment> readyPayments = paymentRepository.findReadyByReservationId(reservation.getId());
        Payment existingReady = readyPayments.isEmpty() ? null : readyPayments.get(0);

        if (existingReady != null) {
            // 재사용 시에도 금액을 현재 정책 값으로 다시 맞춘다 — 예전 READY 행에는
            // 클라이언트가 보냈던 금액이 그대로 남아 있을 수 있다.
            if (!Integer.valueOf(amount).equals(existingReady.getAmount())) {
                log.info("Resyncing READY payment amount: paymentId={}, {} -> {}",
                        existingReady.getId(), existingReady.getAmount(), amount);
                existingReady.setAmount(amount);
            }
            log.info("Reusing existing READY payment: paymentId={}, merchantUid={}",
                    existingReady.getId(), existingReady.getMerchantUid());
            return PaymentPrepareDto.builder()
                    .merchantUid(existingReady.getMerchantUid())
                    .amount(amount)
                    .productName(existingReady.getProductName())
                    .buyerName(existingReady.getBuyerName())
                    .buyerEmail(existingReady.getBuyerEmail())
                    .buyerTel(existingReady.getBuyerTel())
                    .storeId(portoneService.getStoreId())
                    .pgProvider(existingReady.getPgProvider())
                    .reservationId(reservation.getId())
                    .build();
        }

        String merchantUid = generateMerchantUid();

        Payment payment = Payment.builder()
                .member(member)
                .reservation(reservation)
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(requestDto.getProductName())
                .buyerName(requestDto.getBuyerName() != null ? requestDto.getBuyerName() : member.getName())
                .buyerEmail(requestDto.getBuyerEmail() != null ? requestDto.getBuyerEmail() : member.getEmail())
                .buyerTel(requestDto.getBuyerTel())
                .pgProvider(requestDto.getPgProvider())
                .status(Payment.PaymentStatus.READY)
                .build();

        paymentRepository.save(payment);

        return PaymentPrepareDto.builder()
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(requestDto.getProductName())
                .buyerName(payment.getBuyerName())
                .buyerEmail(payment.getBuyerEmail())
                .buyerTel(payment.getBuyerTel())
                .storeId(portoneService.getStoreId())
                .pgProvider(requestDto.getPgProvider())
                .reservationId(reservation.getId())
                .build();
    }

    /**
     * 결제할 예약금을 서버에서 결정한다.
     *
     * <p>예약 생성 시 {@code store.noShowDeposit} 을 예약에 복사해 두므로(ReservationService)
     * 예약의 값이 1순위다. 과거 데이터 등으로 비어 있으면 가게의 현재 설정으로 폴백한다.
     * 어느 쪽도 없으면 0 을 돌려주고 호출측이 400 으로 막는다.
     */
    private int resolveDepositAmount(Reservation reservation) {
        Integer fromReservation = reservation.getDepositAmount();
        if (fromReservation != null && fromReservation > 0) {
            return fromReservation;
        }
        Store store = reservation.getStore();
        Integer fromStore = (store != null) ? store.getNoShowDeposit() : null;
        return (fromStore != null && fromStore > 0) ? fromStore : 0;
    }

    /**
     * 외부(사용자) 결제 검증 요청 — <b>본인 결제만.</b>
     *
     * <p>2026-08-09 추가. 예전 컨트롤러는 {@code SecurityUtil.getCurrentMember()} 의 반환값을
     * 버리고 body 의 merchantUid 를 그대로 신뢰했다. 환불 엔드포인트에서 고친 것과 같은 구멍이다.
     */
    public PaymentResponseDto verifyAndCompletePaymentByMember(PaymentVerifyDto verifyDto, Member requester) {
        Payment payment = paymentRepository.findByMerchantUid(verifyDto.getMerchantUid())
                .orElseThrow(PaymentException::notFound);

        if (payment.getMember() == null || !payment.getMember().getId().equals(requester.getId())) {
            log.warn("Payment verify denied - not owner: merchantUid={}, requesterId={}",
                    verifyDto.getMerchantUid(), requester.getId());
            throw new PaymentException("본인의 결제만 검증할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        return verifyAndCompletePayment(verifyDto);
    }

    public PaymentResponseDto verifyAndCompletePayment(PaymentVerifyDto verifyDto) {
        Payment payment = paymentRepository.findByMerchantUid(verifyDto.getMerchantUid())
                .orElseThrow(PaymentException::notFound);

        // ★ 상태 가드 (2026-08-09) — 예전엔 상태를 보지 않아 몇 번이든 다시 돌릴 수 있었다.
        //   PC 결제는 usePayment 와 PaymentResult 에서 실제로 두 번 호출되고 있고,
        //   환불된 결제에 대고 재실행하면 completePayment 가 다시 돌아 상태가 뒤엉킨다.
        //   이미 끝난 검증은 같은 결과를 그대로 돌려주고(멱등), 그 외 상태는 막는다.
        if (payment.getStatus() == Payment.PaymentStatus.PAID) {
            log.info("Payment already verified, returning existing result: {}", payment.getMerchantUid());
            return PaymentResponseDto.fromEntity(payment);
        }
        if (payment.getStatus() != Payment.PaymentStatus.READY) {
            throw new PaymentException("검증할 수 있는 결제 상태가 아닙니다.", HttpStatus.BAD_REQUEST);
        }

        // V2 API: merchantUid(=paymentId)로 조회
        PortoneV2PaymentResponse portonePayment = portoneService.getPaymentInfo(payment.getMerchantUid());

        if (portonePayment.getAmount() != payment.getAmount()) {
            payment.failPayment("결제 금액 불일치");
            throw new PaymentException("결제 금액이 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        if (!portonePayment.isPaid()) {
            payment.failPayment("결제 상태 이상: " + portonePayment.getStatus());
            throw new PaymentException("결제가 완료되지 않았습니다.", HttpStatus.BAD_REQUEST);
        }

        // V2에서 pgTxId = imp_uid에 해당하는 PG사 거래번호
        String pgTxId = portonePayment.getPgTxId() != null ? portonePayment.getPgTxId() : verifyDto.getImpUid();
        payment.completePayment(pgTxId, portonePayment.getPayMethod(), portonePayment.getPgProvider());

        Reservation reservation = payment.getReservation();
        reservation.markDepositPaid(payment.getAmount());

        // 결제 완료 후 자동 승인 처리
        // autoApprovalEnabled=true인 가게는 결제가 완료된 시점에 CONFIRMED로 전환
        Store store = reservation.getStore();
        if (Boolean.TRUE.equals(store.getAutoApprovalEnabled())
                && reservation.getStatus() == Reservation.ReservationStatus.PENDING) {
            reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
            log.info("Auto-approve processed: reservationId={}", reservation.getId());
        }

        log.info("Payment verified: {}", payment.getMerchantUid());
        return PaymentResponseDto.fromEntity(payment);
    }

    /**
     * 환불 실행 — <b>이미 권한·정책 검사가 끝난 호출자만 쓴다(내부용).</b>
     *
     * <p>⚠️ 이 메서드는 "누가 요청했는지"를 보지 않는다. 컨트롤러가 이걸 직접 부르면
     * 로그인만 한 사람이 남의 결제를 취소하거나 환불 정책을 건너뛸 수 있다
     * (2026-08-09 실제로 그런 상태였다). 외부 요청은 반드시
     * {@link #refundByMemberRequest(Long, String, Member)} 를 거쳐야 한다.
     */
    public PaymentResponseDto refundPayment(PaymentRefundDto refundDto) {
        // ★★ 행을 잠그고 읽는다 (2026-08-23) — 이중 환불 방어의 핵심.
        //   예전엔 잠금 없이 읽어서, 동시 요청 둘이 모두 PAID 를 보고 **둘 다 PG 취소를 불렀다.**
        //   왜 낙관적 락이 아닌지는 PaymentRepository#findByIdForUpdate 주석에 있다
        //   (요약: 되돌릴 수 없는 PG 호출이 커밋보다 먼저 일어나서 낙관적 락으로는 못 막는다).
        Payment payment = (refundDto.getPaymentId() != null)
                ? paymentRepository.findByIdForUpdate(refundDto.getPaymentId()).orElseThrow(PaymentException::notFound)
                : paymentRepository.findPaidByReservationIdForUpdate(refundDto.getReservationId()).orElseThrow(PaymentException::notFound);

        // 잠근 뒤에 다시 본다. 앞선 요청이 방금 바꿔놨을 수 있고, 그걸 여기서 걸러야 한다.
        if (payment.getStatus() == Payment.PaymentStatus.REFUND_PENDING) {
            // 결말을 모르는 채로 또 취소를 걸면 이중 환불이다. 재시도는 스케줄러·웹훅이 결말을 확정한 뒤에.
            throw new PaymentException("직전 환불 요청의 처리 결과를 확인하는 중입니다. 잠시 후 다시 시도해주세요.",
                    HttpStatus.CONFLICT);
        }
        if (payment.getStatus() != Payment.PaymentStatus.PAID) {
            throw new PaymentException("환불 가능한 결제 상태가 아닙니다.", HttpStatus.BAD_REQUEST);
        }

        Integer refundAmount = refundDto.getRefundAmount() != null ? refundDto.getRefundAmount() : payment.getAmount();

        // ★ 마지막 방어선 — 환불액은 결제액을 넘을 수 없다(2026-08-09).
        //   넘는 값이 들어오면 PG 가 거절하거나, 받아버리면 결제액보다 많은 돈이 나간다.
        //   호출측을 믿지 않고 여기서 한 번 더 자른다.
        if (refundAmount == null || refundAmount <= 0) {
            throw new PaymentException("환불 금액이 올바르지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        // 2026-08-23: 비교 대상이 결제액 → **남은 환불 가능액** 으로 바뀌었다.
        // 부분 환불이 이미 있었다면 결제액 기준으로는 통과하면서 총액을 넘길 수 있었다.
        if (refundAmount > payment.remainingRefundable()) {
            log.warn("Refund amount exceeds refundable balance: paymentId={}, requested={}, paid={}, alreadyRefunded={}",
                    payment.getId(), refundAmount, payment.getAmount(), payment.refundedSoFar());
            throw new PaymentException("환불 금액이 남은 환불 가능 금액을 초과합니다.", HttpStatus.BAD_REQUEST);
        }

        // ★ PG 를 부르기 **직전**에 원장을 남기고 즉시 커밋한다(별도 트랜잭션).
        //   여기서부터 PG 응답을 받기 전까지가 유일한 "돈은 움직였는데 기록이 없는" 구간이다.
        //   그 구간에서 서버가 죽어도 원장에 REQUESTED 가 남아 사람이 찾아낼 수 있다.
        Long attemptId = refundLedgerService.start(
                payment.getId(), payment.getMerchantUid(), refundAmount, refundDto.getRefundReason());

        PortoneV2CancelResponse cancelResult;
        try {
            cancelResult = portoneService.cancelPayment(
                    payment.getMerchantUid(), refundAmount, refundDto.getRefundReason());
        } catch (RuntimeException e) {
            // PG 호출 자체가 실패(4xx/5xx/통신). 돈이 나갔는지는 **알 수 없다** —
            // 요청이 PG 에 닿은 뒤 응답만 못 받았을 수도 있다. 그래서 FAILED 로 닫되
            // 원장에 사유를 남겨 사람이 콘솔에서 대조하게 한다.
            refundLedgerService.failed(attemptId, e.getMessage());
            throw e;
        }

        // ★★ A-4: 응답 상태를 실제로 본다 (2026-08-23).
        //   예전엔 응답을 버리고 무조건 환불 완료로 적었다. REQUESTED 는 "접수됨"이지 "환불됨"이 아니다.
        switch (cancelResult.resolveStatus()) {
            case SUCCEEDED -> {
                refundLedgerService.succeeded(attemptId, cancelResult.cancellationId(), cancelResult.cancelledAmount());
                applyRefundSucceeded(payment, refundAmount, refundDto.getRefundReason());
            }
            case REQUESTED, UNKNOWN -> {
                String note = "PG cancellation not final: " + cancelResult.resolveStatus();
                refundLedgerService.pending(attemptId, cancelResult.cancellationId(), note);
                payment.markRefundPending(refundDto.getRefundReason());
                log.warn("Refund is not final yet: paymentId={}, merchantUid={}, status={}, cancellationId={}",
                        payment.getId(), payment.getMerchantUid(), cancelResult.resolveStatus(),
                        cancelResult.cancellationId());
                // 예약 상태는 건드리지 않는다. 돈이 돌아온 게 확정된 뒤에 바꾼다.
            }
            case FAILED -> {
                refundLedgerService.failed(attemptId, cancelResult.failureReason());
                log.error("Refund rejected by PG: paymentId={}, merchantUid={}, reason={}",
                        payment.getId(), payment.getMerchantUid(), cancelResult.failureReason());
                throw new PaymentException("환불이 거절되었습니다. 고객센터로 문의해주세요.",
                        HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }

        return PaymentResponseDto.fromEntity(payment);
    }

    /**
     * 환불이 <b>확정</b>됐을 때만 실행되는 뒷정리. 웹훅·스케줄러도 같은 결말에 도달하면 여기를 부른다 —
     * 확정 처리를 세 곳에 복붙하면 반드시 어긋난다(설계 원칙: 관문 하나).
     */
    void applyRefundSucceeded(Payment payment, Integer refundAmount, String reason) {
        payment.refundPayment(refundAmount, reason);

        if (payment.getStatus() == Payment.PaymentStatus.REFUNDED) {
            Reservation reservation = payment.getReservation();
            reservation.setDepositPaid(false);
            reservation.setDepositAmount(0);
        }
        log.info("Refund confirmed: paymentId={}, merchantUid={}, amount={}, totalRefunded={}, status={}",
                payment.getId(), payment.getMerchantUid(), refundAmount,
                payment.refundedSoFar(), payment.getStatus());
    }

    /**
     * 미결 환불의 <b>성공 확정</b> — 재조회 스케줄러와 PortOne 웹훅이 함께 쓴다.
     *
     * <p>여기서도 행을 잠그고 상태를 다시 본다. 웹훅과 스케줄러가 <b>동시에</b> 같은 결말에
     * 도달하는 건 정상이고(웹훅이 먼저 오고 스케줄러가 뒤따르는 식), 그때 두 번 반영되면
     * 환불액이 두 배로 적힌다.
     *
     * @return 이번 호출이 실제로 상태를 바꿨으면 true. 이미 처리돼 있었으면 false(멱등).
     */
    @Transactional
    public boolean confirmPendingRefund(Long paymentId, Integer refundAmount, String reason) {
        Payment payment = paymentRepository.findByIdForUpdate(paymentId).orElse(null);
        if (payment == null) {
            log.error("Cannot confirm refund - payment not found: paymentId={}", paymentId);
            return false;
        }
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING) {
            log.info("Refund confirmation skipped - not pending: paymentId={}, status={}",
                    paymentId, payment.getStatus());
            return false;
        }
        applyRefundSucceeded(payment, refundAmount, reason);
        return true;
    }

    /**
     * 미결 환불의 <b>최종 실패 확정</b>. 돈이 안 나갔으므로 결제를 PAID 로 되돌린다 —
     * 그래야 손님이 다시 취소를 시도할 수 있다. 되돌리지 않으면 REFUND_PENDING 에 영원히 갇힌다.
     *
     * @return 이번 호출이 실제로 상태를 바꿨으면 true.
     */
    @Transactional
    public boolean revertPendingRefund(Long paymentId, String failReason) {
        Payment payment = paymentRepository.findByIdForUpdate(paymentId).orElse(null);
        if (payment == null) {
            log.error("Cannot revert refund - payment not found: paymentId={}", paymentId);
            return false;
        }
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING) {
            return false;
        }
        payment.revertRefundPending(failReason);
        log.warn("Pending refund reverted: paymentId={}, merchantUid={}, status={}, reason={}",
                paymentId, payment.getMerchantUid(), payment.getStatus(), failReason);
        return true;
    }

    /**
     * 외부(사용자) 환불 요청 — <b>소유자 확인 + 환불 정책 강제.</b>
     *
     * <h3>왜 따로 만들었나 (2026-08-09)</h3>
     * {@code POST /api/payment/refund} 가 {@link #refundPayment} 를 그대로 불렀고,
     * 그 경로엔 세 가지 구멍이 있었다.
     * <ol>
     *   <li><b>내 결제인지 확인하지 않았다</b> — {@code reservationId} 를 body 에서 그대로 받아
     *       조회했다. 로그인만 하면 남의 결제를 취소할 수 있었다(IDOR).</li>
     *   <li><b>환불 금액을 요청자가 정했다</b> — body 의 {@code refundAmount} 를 그대로 썼다.</li>
     *   <li><b>환불 정책을 건너뛰었다</b> — 정상 경로(예약 취소)는
     *       {@link #refundByReservationCancel} 이 정책을 계산해 넘기는데,
     *       이 엔드포인트는 그걸 지나치고 바로 PG 를 호출했다.
     *       즉 "환불 불가" 예약도 전액 환불받을 수 있었다.</li>
     * </ol>
     * 다행히 프론트는 이 엔드포인트를 호출하지 않고 있었다(상수만 정의되고 호출처 0건).
     *
     * <h3>지금 규칙</h3>
     * 예약 본인 또는 ADMIN 만 요청할 수 있고, 환불액은 <b>항상 가게 정책으로 계산한 값</b>을 쓴다.
     * 요청 본문의 금액은 <b>무시한다</b> — 받아서 검증하는 것보다 아예 안 받는 게 안전하다.
     */
    public PaymentResponseDto refundByMemberRequest(Long reservationId, String reason, Member requester) {
        if (reservationId == null) {
            throw new PaymentException("예약 정보가 필요합니다.", HttpStatus.BAD_REQUEST);
        }

        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationException::notFound);

        boolean isOwner = reservation.getMember() != null
                && reservation.getMember().getId().equals(requester.getId());
        boolean isAdmin = requester.getRole() == Role.ADMIN;

        if (!isOwner && !isAdmin) {
            // 남의 예약이 "존재한다"는 사실까지 알려줄 필요는 없다 — 404 가 아니라 403 으로도
            // 충분히 새지만, 여기서는 권한 없음을 명확히 하는 쪽이 디버깅에 낫다.
            log.warn("Refund denied - not owner: reservationId={}, requesterId={}", reservationId, requester.getId());
            throw new PaymentException("본인의 예약만 환불할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        // ★ 금액은 정책에서만 나온다. 요청 본문의 refundAmount 는 쓰지 않는다.
        RefundCalculationResult calculation = calculateRefundAmount(reservationId);
        if (calculation.getRefundAmount() <= 0) {
            throw new PaymentException("환불할 수 없습니다. (" + calculation.getReason() + ")", HttpStatus.BAD_REQUEST);
        }

        PaymentRefundDto safeDto = PaymentRefundDto.builder()
                .reservationId(reservationId)
                .refundAmount(calculation.getRefundAmount())
                .refundReason(reason != null && !reason.isBlank() ? reason : "이용자 요청 환불 (" + calculation.getReason() + ")")
                .build();

        log.info("Refund requested by member: reservationId={}, requesterId={}, admin={}, amount={}",
                reservationId, requester.getId(), isAdmin, calculation.getRefundAmount());

        return refundPayment(safeDto);
    }

    /**
     * 예약 취소에 따른 자동 환불.
     *
     * <p>★ {@code REQUIRES_NEW} 인 이유 (2026-08-09) — 예전엔 호출자(cancelReservation)의
     * 트랜잭션에 그대로 참여했다. 그래서 PG 가 에러를 주면 <b>예약 취소까지 통째로 롤백</b>됐고,
     * 실제로 PortOne 이 404 를 주던 동안 예약금을 낸 고객은 예약 취소 자체가 불가능했다.
     * 호출자가 예외를 catch 해도 소용없다 — 참여 트랜잭션에서 예외가 나면 전체가
     * rollback-only 로 표시돼 커밋 시점에 터진다. 별도 트랜잭션이어야 격리된다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void refundByReservationCancel(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationException::notFound);

        Payment payment = paymentRepository.findPaidByReservationId(reservationId).orElse(null);

        if (payment == null) {
            log.info("No refundable payment found or already processed: reservationId={}", reservationId);
            return;
        }

        RefundCalculationResult calculation = calculateRefundAmount(reservationId);

        if (calculation.getRefundAmount() > 0) {
            PaymentRefundDto refundDto = PaymentRefundDto.builder()
                    .reservationId(reservationId)
                    .refundAmount(calculation.getRefundAmount())
                    .refundReason("예약 취소에 따른 자동 환불 (" + calculation.getReason() + ")")
                    .build();

            refundPayment(refundDto);
        } else {
            log.info("Refund amount is 0 by policy: reason={}", calculation.getReason());
        }
    }

    /**
     * 가게 측 결정(거절·취소)에 따른 <b>전액</b> 환불 (2026-08-11 추가).
     *
     * <p><b>왜 정책 계산({@link #calculateRefundAmount})을 쓰지 않나</b> — 그 정책은
     * "이용자가 마음을 바꿔 취소할 때 며칠 전이냐"로 위약금을 매기는 규칙이다.
     * 가게가 거절하거나 취소한 건 이용자 귀책이 아니므로 위약금을 물릴 근거가 없다.
     * 이용약관({@code frontend/src/pages/policy/Terms.jsx})도 가게 사정에 의한 취소는
     * 전액 환불이라고 명시하고 있다. 정책을 그대로 태우면 "가게가 당일에 취소했는데
     * 예약금은 한 푼도 못 돌려받는" 상황이 나온다.
     *
     * <p><b>왜 {@code REQUIRES_NEW} 인가</b> — {@link #refundByReservationCancel} 과 같은 이유다.
     * 호출자(예약 거절·취소)의 트랜잭션에 참여하면 PG 오류 한 번에 <b>상태 변경까지 통째로 롤백</b>된다.
     * 호출자가 예외를 catch 해도 소용없다(참여 트랜잭션은 rollback-only 로 마킹된다).
     *
     * <p>결제 기록이 없으면(무료 예약 등) 조용히 반환한다 — 환불할 게 없는 건 오류가 아니다.
     *
     * @return 실제로 환불이 일어났으면 {@code true}, 환불할 결제가 없었으면 {@code false}.
     *         ★ <b>이 값을 반드시 봐야 한다</b> — "예외가 안 났다"와 "돈이 돌아갔다"는 다른 말이다.
     *         PAID 행이 없는 경우(이미 부분 환불돼 PARTIAL_REFUNDED 로 넘어간 결제 등)에도
     *         이 메서드는 정상 반환한다. 그걸 성공으로 읽고 예약금 플래그를 지우면
     *         <b>남은 금액을 영영 안 돌려준 채 "전액 환불됨"으로 기록</b>된다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean refundFullByStoreDecision(Long reservationId, String reason) {
        Payment payment = paymentRepository.findPaidByReservationId(reservationId).orElse(null);

        if (payment == null) {
            log.warn("No refundable PAID payment for store-side decision - deposit flags left untouched: reservationId={}",
                    reservationId);
            return false;
        }

        PaymentRefundDto refundDto = PaymentRefundDto.builder()
                .reservationId(reservationId)
                // 명시적으로 결제 전액을 싣는다. null 을 넘기면 refundPayment 가 payment.getAmount()
                // 로 채워주긴 하지만, "전액"이 이 메서드의 계약이므로 값으로 드러내 둔다.
                .refundAmount(payment.getAmount())
                .refundReason(reason != null && !reason.isBlank() ? reason : "가게 사정에 의한 취소 - 전액 환불")
                .build();

        log.info("Full refund by store decision: reservationId={}, amount={}", reservationId, payment.getAmount());
        refundPayment(refundDto);
        return true;
    }

    /**
     * 환불 예상 금액 조회 — <b>본인 예약 또는 ADMIN 만.</b>
     *
     * <p>2026-08-09 추가. 예전 컨트롤러는 로그인 여부만 보고 reservationId 를 그대로 받아서,
     * 아무나 예약 ID 를 훑으며 다른 사람의 결제 금액·가게 환불 정책·예약 존재 여부를 읽을 수 있었다.
     */
    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmountForMember(Long reservationId, Member requester) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationException::notFound);

        boolean isOwner = reservation.getMember() != null
                && reservation.getMember().getId().equals(requester.getId());
        boolean isAdmin = requester.getRole() == Role.ADMIN;

        if (!isOwner && !isAdmin) {
            log.warn("Refund preview denied - not owner: reservationId={}, requesterId={}",
                    reservationId, requester.getId());
            throw new PaymentException("본인의 예약만 조회할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        return calculateRefundAmount(reservationId);
    }

    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmount(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        Store store = reservation.getStore();
        // ★ KST 기준 오늘이어야 한다 — 환불 구간을 가르는 숫자다.
        //   컨테이너가 UTC 라 인자 없는 LocalDate.now() 는 한국 시간 00:00~09:00 사이에 "어제"를 준다.
        //   그러면 daysUntil 이 1 커져서 **정책보다 한 구간 후한 환불**이 나갔다(부분 환불 → 전액 등).
        long daysUntil = ChronoUnit.DAYS.between(ServiceTime.today(), reservation.getReservationDate());

        // ★ 금액의 출처를 하나로 모은다 (2026-08-09)
        //   예전엔 계산은 reservation.depositAmount(예약 만들 때 복사해둔 값)를 쓰고,
        //   실제 환불 실행은 payment.amount(결제 요청 시 프론트가 보낸 값)를 썼다.
        //   둘이 어긋나면 화면엔 "5,000원 환불"이라고 보여주고 실제로는 다른 금액이 나간다.
        //   → **실제 결제 기록이 진실**이다. 결제 기록이 없을 때만 예약의 예약금으로 폴백한다
        //   (나중 결제·미결제 예약은 어차피 환불할 게 없어 0 으로 떨어진다).
        // ★ 폴백을 없앴다 (2026-08-09).
        //   예전엔 PAID 행이 없으면 reservation.depositAmount 로 폴백했다. 그런데
        //   실행부(refundPayment)는 PAID 행이 없으면 404 를 던진다. 그래서 미리보기는
        //   "10,000원 환불 가능"이라고 보여주고 실제 취소는 404 로 실패하는 상태였다.
        //   부분 환불 후(PAID 행이 PARTIAL_REFUNDED 로 바뀜)와 미결제 예약에서 둘 다 발생한다.
        //   미리보기와 실행이 같은 조회를 쓰도록 맞춘다 — 결제 기록이 없으면 환불액은 0 이다.
        int paidAmount = paymentRepository.findPaidByReservationId(reservationId)
                .map(Payment::getAmount)
                .orElse(0);

        if (paidAmount <= 0) return new RefundCalculationResult(0, 0, "결제 내역 없음");

        int fullDays = store.getFullRefundDays() != null ? store.getFullRefundDays() : 3;
        int partialDays = store.getPartialRefundDays() != null ? store.getPartialRefundDays() : 1;
        int partialRate = store.getPartialRefundRate() != null ? store.getPartialRefundRate() : 50;

        // ★★ 0 은 "기준일"이 아니라 **비활성 sentinel** 이다 (2026-08-09 수정)
        //
        // 프론트 옵션(categories.js)이 fullRefundDays=0 을 "환불 없음",
        // partialRefundDays=0 을 "적용 안 함" 으로 보낸다.
        // 그런데 예전 코드는 그냥 `daysUntil >= 0` 을 평가했고,
        // 미래 예약은 항상 daysUntil >= 0 이므로 **"환불 없음"을 고른 가게가
        // 당일 취소에도 전액을 돌려주는** 정반대 동작이 됐다. 사장님 돈이 그대로 나간다.
        //
        // 정책(사용자 확인 2026-08-09):
        //   fullRefundDays == 0  → 이 가게는 **어떤 환불도 하지 않는다**(부분 환불도 함께 막는다).
        //     → "환불 없음"으로 공지해 놓고 부분 환불만 조용히 나가는 것이 더 큰 분쟁 요인이다.
        //   partialRefundDays == 0 → 부분 환불만 미적용(전액 구간은 그대로 살린다).
        if (fullDays <= 0) {
            return new RefundCalculationResult(0, 0, "환불 불가");
        }

        if (daysUntil >= fullDays) {
            return new RefundCalculationResult(paidAmount, 100, "전액 환불 가능");
        }

        // partialDays 가 fullDays 이상이면 부분 환불 구간(partialDays <= d < fullDays)이 비어
        // 설정이 조용히 죽는다. 저장 시에도 막지만(StoreService), 이미 저장된 데이터가
        // 있을 수 있어 계산 시점에도 방어적으로 둔다.
        if (partialDays > 0 && partialDays < fullDays && daysUntil >= partialDays) {
            // int 곱셈은 결제액이 커지면 넘칠 수 있어 long 으로 계산한 뒤 결제액으로 한 번 더 자른다.
            long partial = (long) paidAmount * partialRate / 100L;
            return new RefundCalculationResult((int) Math.min(partial, paidAmount), partialRate, "부분 환불 가능");
        }

        return new RefundCalculationResult(0, 0, "환불 불가");
    }

    @Transactional(readOnly = true)
    public List<PaymentResponseDto> getPaymentsByMember(Long memberId) {
        return paymentRepository.findByMemberIdOrderByCreatedAtDesc(memberId)
                .stream()
                .map(PaymentResponseDto::fromEntity)
                .collect(Collectors.toList());
    }

    private String generateMerchantUid() {
        return "ORD-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + "-" + UUID.randomUUID().toString().substring(0, 6);
    }

    @lombok.Getter
    @lombok.AllArgsConstructor
    public static class RefundCalculationResult {
        private int refundAmount;
        private int refundRate;
        private String reason;
    }
}