package com.reserve.payment.service;

import com.reserve.global.error.MemberException;
import com.reserve.global.error.PaymentException;
import com.reserve.global.error.ReservationException;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.payment.dto.*;
import com.reserve.payment.dto.PortoneV2PaymentResponse;
import com.reserve.payment.entity.Payment;
import com.reserve.payment.repository.PaymentRepository;
import com.reserve.reservation.entity.Reservation;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.store.entity.Store;
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
            log.info("기존 READY Payment 재사용: paymentId={}, merchantUid={}",
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
            log.info("자동 승인 처리: reservationId={}", reservation.getId());
        }

        log.info("결제 검증 성공: {}", payment.getMerchantUid());
        return PaymentResponseDto.fromEntity(payment);
    }

    public PaymentResponseDto refundPayment(PaymentRefundDto refundDto) {
        Payment payment = (refundDto.getPaymentId() != null)
                ? paymentRepository.findById(refundDto.getPaymentId()).orElseThrow(PaymentException::notFound)
                : paymentRepository.findPaidByReservationId(refundDto.getReservationId()).orElseThrow(PaymentException::notFound);

        if (payment.getStatus() != Payment.PaymentStatus.PAID) {
            throw new PaymentException("환불 가능한 결제 상태가 아닙니다.", HttpStatus.BAD_REQUEST);
        }

        Integer refundAmount = refundDto.getRefundAmount() != null ? refundDto.getRefundAmount() : payment.getAmount();

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

    public void refundByReservationCancel(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationException::notFound);

        Payment payment = paymentRepository.findPaidByReservationId(reservationId).orElse(null);

        if (payment == null) {
            log.info("환불할 결제 내역이 없거나 이미 처리되었습니다. (예약ID: {})", reservationId);
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
            log.info("환불 정책에 의해 환불 금액이 0원입니다. (사유: {})", calculation.getReason());
        }
    }

    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmount(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        Store store = reservation.getStore();
        long daysUntil = ChronoUnit.DAYS.between(LocalDate.now(), reservation.getReservationDate());
        int paidAmount = reservation.getDepositAmount() != null ? reservation.getDepositAmount() : 0;

        if (paidAmount == 0) return new RefundCalculationResult(0, 0, "결제 내역 없음");

        int fullDays = store.getFullRefundDays() != null ? store.getFullRefundDays() : 3;
        int partialDays = store.getPartialRefundDays() != null ? store.getPartialRefundDays() : 1;
        int partialRate = store.getPartialRefundRate() != null ? store.getPartialRefundRate() : 50;

        if (daysUntil >= fullDays) return new RefundCalculationResult(paidAmount, 100, "전액 환불 가능");
        if (daysUntil >= partialDays) return new RefundCalculationResult((paidAmount * partialRate) / 100, partialRate, "부분 환불 가능");

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