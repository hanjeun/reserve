package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PaymentRefundDto;
import kr.it.reserve.payment.dto.PaymentResponseDto;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceRefundSafetyTest {

    private static final String MERCHANT_UID = "order-refund-safety";

    @Mock private PaymentRepository paymentRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private PortoneService portoneService;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @InjectMocks
    private PaymentService paymentService;

    @Test
    @DisplayName("PG 호출 결과를 잃으면 FAILED로 닫지 않고 추가 환불을 차단한다")
    void unknownCallOutcomeRemainsPending() {
        Payment payment = paidPayment();
        PaymentRefundDto request = request();
        stubLockedPayment(payment);
        when(refundLedgerService.start(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        when(portoneService.cancelPayment(MERCHANT_UID, 3_000, "예약 취소"))
                .thenThrow(new IllegalStateException("connection reset"));

        PaymentResponseDto response = paymentService.refundPayment(request);

        assertThat(response.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        verify(refundLedgerService).pending(
                20L, null, "PG cancellation call outcome unknown: IllegalStateException");
        verify(refundLedgerService, never()).failed(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
        verify(reconciliationIssueService).record(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                100L,
                MERCHANT_UID,
                "PG_CANCEL_CALL_OUTCOME_UNKNOWN");
    }

    @Test
    @DisplayName("PG가 SUCCEEDED를 보내도 실제 취소액이 다르면 로컬 환불액을 올리지 않는다")
    void succeededAmountMismatchRemainsPending() throws Exception {
        Payment payment = paidPayment();
        PaymentRefundDto request = request();
        stubLockedPayment(payment);
        when(refundLedgerService.start(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "SUCCEEDED",
                    "totalAmount": 2000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(response);

        PaymentResponseDto result = paymentService.refundPayment(request);

        assertThat(result.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
        assertThat(payment.refundedSoFar()).isZero();
        verify(refundLedgerService).pending(
                20L, "cancel-20", "PG succeeded amount does not match request");
        verify(refundLedgerService, never()).succeeded(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
        verify(reconciliationIssueService).record(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                100L,
                MERCHANT_UID,
                "PG_CANCEL_RESPONSE_AMOUNT_MISMATCH");
    }

    @Test
    @DisplayName("가게 측 전액 환불도 PG 접수만 된 상태를 완료로 반환하지 않는다")
    void storeFullRefundReturnsFalseWhilePending() throws Exception {
        Payment payment = paidPayment();
        when(paymentRepository.findPaidByReservationId(100L)).thenReturn(Optional.of(payment));
        when(paymentRepository.findPaidByReservationIdForUpdate(100L)).thenReturn(Optional.of(payment));
        when(refundLedgerService.start(10L, MERCHANT_UID, 10_000, "가게 취소"))
                .thenReturn(20L);
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "REQUESTED",
                    "totalAmount": 10000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(MERCHANT_UID, 10_000, "가게 취소"))
                .thenReturn(response);

        boolean completed = paymentService.refundFullByStoreDecision(100L, "가게 취소");

        assertThat(completed).isFalse();
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        verify(refundLedgerService).pending(
                20L, "cancel-20", "PG cancellation not final: REQUESTED");
    }

    @Test
    @DisplayName("결제가 PAID여도 앞선 미결 원장이 있으면 PG 취소를 다시 보내지 않는다")
    void unresolvedLedgerBlocksRetryAfterLocalRollback() {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(refundAttemptRepository.existsByPaymentIdAndStatusIn(10L, RefundAttempt.UNRESOLVED))
                .thenReturn(true);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> paymentService.refundPayment(request()))
                .isInstanceOf(kr.it.reserve.global.error.PaymentException.class)
                .hasMessageContaining("직전 환불 요청");

        verify(portoneService, never()).cancelPayment(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString());
        verify(refundLedgerService, never()).start(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    @DisplayName("원장을 시작하지 못하면 PG 취소를 보내지 않는다")
    void ledgerStartFailureStopsBeforePgCall() {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(refundLedgerService.start(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(null);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> paymentService.refundPayment(request()))
                .isInstanceOf(kr.it.reserve.global.error.PaymentException.class)
                .hasMessageContaining("안전하게 기록하지 못했습니다");

        verify(portoneService, never()).cancelPayment(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    @DisplayName("PG 성공 원장은 로컬 결제 트랜잭션의 커밋 뒤에만 성공으로 닫는다")
    void successfulLedgerClosesAfterLocalCommit() throws Exception {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(refundLedgerService.start(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "SUCCEEDED",
                    "totalAmount": 3000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(response);

        TransactionSynchronizationManager.initSynchronization();
        try {
            PaymentResponseDto result = paymentService.refundPayment(request());

            assertThat(result.getStatus()).isEqualTo(Payment.PaymentStatus.PARTIAL_REFUNDED.name());
            verify(refundLedgerService).pending(
                    20L, "cancel-20", "PG cancellation succeeded; local commit pending");
            verify(refundLedgerService, never()).succeeded(20L, "cancel-20", 3_000);

            for (TransactionSynchronization synchronization
                    : TransactionSynchronizationManager.getSynchronizations()) {
                synchronization.afterCommit();
            }
            verify(refundLedgerService).succeeded(20L, "cancel-20", 3_000);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("동시 결말 처리에서는 같은 누적 환불만 멱등으로 인정한다")
    void pendingRefundResolutionRequiresMatchingLocalState() {
        Payment pending = Payment.builder()
                .id(10L)
                .amount(10_000)
                .refundAmount(2_000)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(pending));

        assertThat(paymentService.confirmPendingRefund(10L, 1_000, 3_000, "예약 취소"))
                .isFalse();
        assertThat(pending.refundedSoFar()).isEqualTo(2_000);
        assertThat(pending.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);

        Payment alreadyApplied = Payment.builder()
                .id(11L)
                .amount(10_000)
                .refundAmount(5_000)
                .status(Payment.PaymentStatus.PARTIAL_REFUNDED)
                .build();
        when(paymentRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(alreadyApplied));

        assertThat(paymentService.confirmPendingRefund(11L, 2_000, 3_000, "예약 취소"))
                .isTrue();
        assertThat(alreadyApplied.refundedSoFar()).isEqualTo(5_000);
    }

    private void stubLockedPayment(Payment payment) {
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(payment));
    }

    private Payment paidPayment() {
        Reservation reservation = org.mockito.Mockito.mock(Reservation.class);
        org.mockito.Mockito.lenient().when(reservation.getId()).thenReturn(100L);
        return Payment.builder()
                .id(10L)
                .reservation(reservation)
                .merchantUid(MERCHANT_UID)
                .amount(10_000)
                .refundAmount(0)
                .status(Payment.PaymentStatus.PAID)
                .build();
    }

    private PaymentRefundDto request() {
        return PaymentRefundDto.builder()
                .paymentId(10L)
                .refundAmount(3_000)
                .refundReason("예약 취소")
                .build();
    }
}
