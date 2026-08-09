package kr.it.reserve.payment.service;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
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

    public PaymentPrepareDto preparePayment(PaymentRequestDto requestDto, Long memberId) {
        Reservation reservation = reservationRepository.findById(requestDto.getReservationId())
                .orElseThrow(ReservationException::notFound);

        Member member = memberRepository.findById(memberId)
                .orElseThrow(MemberException::notFound);

        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new PaymentException("이미 결제가 완료된 예약입니다.", HttpStatus.CONFLICT);
        }

        // 기존 READY 상태 Payment가 있으면 재사용 (결제창 재시도 지원)
        // findReadyByReservationId 사용 → 여러 레코드 있어도 안전 (첫 번째만 사용)
        List<Payment> readyPayments = paymentRepository.findReadyByReservationId(reservation.getId());
        Payment existingReady = readyPayments.isEmpty() ? null : readyPayments.get(0);

        if (existingReady != null) {
            log.info("Reusing existing READY payment: paymentId={}, merchantUid={}",
                    existingReady.getId(), existingReady.getMerchantUid());
            return PaymentPrepareDto.builder()
                    .merchantUid(existingReady.getMerchantUid())
                    .amount(existingReady.getAmount())
                    .productName(existingReady.getProductName())
                    .buyerName(existingReady.getBuyerName())
                    .buyerEmail(existingReady.getBuyerEmail())
                    .buyerTel(existingReady.getBuyerTel())
                    .impCode(portoneService.getImpCode())
                    .pgProvider(existingReady.getPgProvider())
                    .reservationId(reservation.getId())
                    .build();
        }

        String merchantUid = generateMerchantUid();

        Payment payment = Payment.builder()
                .member(member)
                .reservation(reservation)
                .merchantUid(merchantUid)
                .amount(requestDto.getAmount())
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
                .amount(requestDto.getAmount())
                .productName(requestDto.getProductName())
                .buyerName(payment.getBuyerName())
                .buyerEmail(payment.getBuyerEmail())
                .buyerTel(payment.getBuyerTel())
                .impCode(portoneService.getImpCode())
                .pgProvider(requestDto.getPgProvider())
                .reservationId(reservation.getId())
                .build();
    }

    public PaymentResponseDto verifyAndCompletePayment(PaymentVerifyDto verifyDto) {
        Payment payment = paymentRepository.findByMerchantUid(verifyDto.getMerchantUid())
                .orElseThrow(PaymentException::notFound);

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
        Payment payment = (refundDto.getPaymentId() != null)
                ? paymentRepository.findById(refundDto.getPaymentId()).orElseThrow(PaymentException::notFound)
                : paymentRepository.findPaidByReservationId(refundDto.getReservationId()).orElseThrow(PaymentException::notFound);

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
        if (refundAmount > payment.getAmount()) {
            log.warn("Refund amount exceeds paid amount: paymentId={}, requested={}, paid={}",
                    payment.getId(), refundAmount, payment.getAmount());
            throw new PaymentException("환불 금액이 결제 금액을 초과합니다.", HttpStatus.BAD_REQUEST);
        }

        // V2 API: merchantUid 기반으로 취소
        portoneService.cancelPayment(payment.getMerchantUid(), refundAmount, refundDto.getRefundReason());

        payment.refundPayment(refundAmount, refundDto.getRefundReason());

        if (refundAmount.equals(payment.getAmount())) {
            Reservation reservation = payment.getReservation();
            reservation.setDepositPaid(false);
            reservation.setDepositAmount(0);
        }

        return PaymentResponseDto.fromEntity(payment);
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

    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmount(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        Store store = reservation.getStore();
        long daysUntil = ChronoUnit.DAYS.between(LocalDate.now(), reservation.getReservationDate());

        // ★ 금액의 출처를 하나로 모은다 (2026-08-09)
        //   예전엔 계산은 reservation.depositAmount(예약 만들 때 복사해둔 값)를 쓰고,
        //   실제 환불 실행은 payment.amount(결제 요청 시 프론트가 보낸 값)를 썼다.
        //   둘이 어긋나면 화면엔 "5,000원 환불"이라고 보여주고 실제로는 다른 금액이 나간다.
        //   → **실제 결제 기록이 진실**이다. 결제 기록이 없을 때만 예약의 예약금으로 폴백한다
        //   (나중 결제·미결제 예약은 어차피 환불할 게 없어 0 으로 떨어진다).
        int paidAmount = paymentRepository.findPaidByReservationId(reservationId)
                .map(Payment::getAmount)
                .orElseGet(() -> reservation.getDepositAmount() != null ? reservation.getDepositAmount() : 0);

        if (paidAmount == 0) return new RefundCalculationResult(0, 0, "결제 내역 없음");

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
            return new RefundCalculationResult((paidAmount * partialRate) / 100, partialRate, "부분 환불 가능");
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