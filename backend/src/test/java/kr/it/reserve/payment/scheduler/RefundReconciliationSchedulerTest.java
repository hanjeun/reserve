package kr.it.reserve.payment.scheduler;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RefundReconciliationSchedulerTest {

    private static final String MERCHANT_UID = "order-refund-reconcile";

    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private PortoneService portoneService;
    @Mock private PaymentService paymentService;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @InjectMocks
    private RefundReconciliationScheduler scheduler;

    @Test
    void onlyExplicitlyUnsentIntentsAreDispatchedBeforeReadOnlyReconciliation() {
        when(refundAttemptRepository.findPreparedBefore(eq(RefundAttempt.READY_TO_DISPATCH), any(), any()))
                .thenReturn(List.of(41L));
        when(refundAttemptRepository.findUnresolvedBefore(eq(RefundAttempt.UNRESOLVED), any()))
                .thenReturn(List.of());

        scheduler.reconcileUnresolvedRefunds();

        verify(paymentService).dispatchPreparedRefund(41L);
        verifyNoInteractions(portoneService);
    }

    @Test
    void aPreparedIntentThatCouldNotBeClaimedIsNotMisreadAsAnUnknownPgResult() {
        when(refundAttemptRepository.findPreparedBefore(eq(RefundAttempt.READY_TO_DISPATCH), any(), any()))
                .thenReturn(List.of(20L));
        when(refundAttemptRepository.findUnresolvedBefore(eq(RefundAttempt.UNRESOLVED), any()))
                .thenReturn(List.of(view(null)));
        when(refundAttemptRepository.existsByIdAndStatusAndFailureReason(
                20L, RefundAttempt.Status.REQUESTED, RefundAttempt.READY_TO_DISPATCH)).thenReturn(true);

        scheduler.reconcileUnresolvedRefunds();

        verify(paymentService).dispatchPreparedRefund(20L);
        verifyNoInteractions(portoneService, refundLedgerService);
    }

    @Test
    @DisplayName("재조회도 누적액과 개별 취소가 정확할 때만 환불을 성공 확정한다")
    void confirmsExactRefund() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(2_000);
        PortoneV2PaymentResponse pgPayment = payment("""
                {
                  "status": "PARTIAL_CANCELLED",
                  "amount": {"total": 10000, "cancelled": 5000},
                  "cancellations": [
                    {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                    {"id": "cancel-1", "status": "SUCCEEDED", "totalAmount": 3000}
                  ]
                }
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));
        when(paymentService.confirmPendingRefund(view, 2_000, 3_000, "cancel-1"))
                .thenReturn(true);

        scheduler.reconcileOne(view);

        verify(paymentService).confirmPendingRefund(view, 2_000, 3_000, "cancel-1");
        verify(refundLedgerService, never()).succeeded(20L, "cancel-1", 3_000);
        verify(reconciliationIssueService).resolveForPayment(10L);
    }

    @Test
    void anAlreadyRecordedRefundStillReconcilesItsExactUnresolvedLedger() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(5_000);
        payment.setStatus(Payment.PaymentStatus.PARTIAL_REFUNDED);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(payment("""
                {"status":"PARTIAL_CANCELLED","amount":{"total":10000,"cancelled":5000},
                 "cancellations":[{"id":"old","status":"SUCCEEDED","totalAmount":2000},
                 {"id":"cancel-1","status":"SUCCEEDED","totalAmount":3000}]}
                """));
        when(paymentService.confirmPendingRefund(view, 2_000, 3_000, "cancel-1")).thenReturn(true);

        scheduler.reconcileOne(view);

        verify(paymentService).confirmPendingRefund(view, 2_000, 3_000, "cancel-1");
        verify(refundLedgerService, never()).succeeded(anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("재조회에서 취소가 REQUESTED이면 결제를 원복하지 않는다")
    void keepsRequestedRefundPending() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(0);
        PortoneV2PaymentResponse pgPayment = payment("""
                {
                  "status": "PAID",
                  "amount": {"total": 10000, "cancelled": 0},
                  "cancellations": [
                    {"id": "cancel-1", "status": "REQUESTED", "totalAmount": 3000}
                  ]
                }
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));

        scheduler.reconcileOne(view);

        verify(paymentService, never()).confirmPendingRefund(any(), anyInt(), anyInt(), anyString());
        verify(paymentService, never()).revertPendingRefund(any(), anyInt(), anyString(), anyString());
        verify(refundLedgerService, never()).succeeded(anyLong(), anyString(), anyInt());
        verify(refundLedgerService, never()).failed(anyLong(), anyString());
    }

    @Test
    @DisplayName("재조회 자료가 충돌하면 자동 변경하지 않고 대사 큐에 남긴다")
    void sendsMismatchToManualReconciliation() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(2_000);
        PortoneV2PaymentResponse pgPayment = payment("""
                {
                  "status": "PARTIAL_CANCELLED",
                  "amount": {"total": 10000, "cancelled": 4000},
                  "cancellations": [
                    {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                    {"id": "cancel-1", "status": "SUCCEEDED", "totalAmount": 2000}
                  ]
                }
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));

        scheduler.reconcileOne(view);

        verify(paymentService, never()).confirmPendingRefund(any(), anyInt(), anyInt(), anyString());
        verify(paymentService, never()).revertPendingRefund(any(), anyInt(), anyString(), anyString());
        verify(reconciliationIssueService).recordIssue(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                null,
                MERCHANT_UID,
                "PG_CANCELLATION_AMOUNT_MISMATCH");
    }

    @Test
    @DisplayName("PG 성공 뒤 로컬 결제가 다른 결말로 바뀌면 원장만 성공으로 닫지 않는다")
    void localConflictDoesNotCloseLedger() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(2_000);
        PortoneV2PaymentResponse pgPayment = payment("""
                {
                  "status": "PARTIAL_CANCELLED",
                  "amount": {"total": 10000, "cancelled": 5000},
                  "cancellations": [
                    {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                    {"id": "cancel-1", "status": "SUCCEEDED", "totalAmount": 3000}
                  ]
                }
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));
        when(paymentService.confirmPendingRefund(view, 2_000, 3_000, "cancel-1"))
                .thenReturn(false);

        scheduler.reconcileOne(view);

        verify(refundLedgerService, never()).succeeded(anyLong(), anyString(), anyInt());
        verify(reconciliationIssueService).recordIssue(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                null,
                MERCHANT_UID,
                "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_SUCCESS");
        verify(reconciliationIssueService, never()).resolveForPayment(10L);
    }

    @Test
    @DisplayName("진행 중인 새 행을 포함해 미결 원장이 둘이면 오래된 행도 자동 처리하지 않는다")
    void multipleUnresolvedAttemptsIncludingRecentOneRequireReview() {
        UnresolvedRefundView view = view("cancel-old");
        when(refundAttemptRepository.findUnresolvedBefore(
                org.mockito.ArgumentMatchers.eq(RefundAttempt.UNRESOLVED),
                org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(view));
        when(refundAttemptRepository.countByPaymentIdAndStatusIn(10L, RefundAttempt.UNRESOLVED))
                .thenReturn(2L);

        scheduler.reconcileUnresolvedRefunds();

        verify(portoneService, never()).getPaymentInfo(org.mockito.ArgumentMatchers.anyString());
        verify(reconciliationIssueService).recordIssue(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                null,
                MERCHANT_UID,
                "MULTIPLE_UNRESOLVED_REFUND_ATTEMPTS");
    }

    private UnresolvedRefundView view(String cancellationId) {
        return new UnresolvedRefundView(
                20L,
                10L,
                MERCHANT_UID,
                3_000,
                cancellationId,
                "예약 취소",
                0);
    }

    @Test
    @DisplayName("PG 성공 뒤 로컬 PAID로 남은 종료 예약은 원장 검증 경로로만 복구한다")
    void paidAfterLostCommitUsesExactLedgerRecoveryWithoutCancelResubmission() throws Exception {
        UnresolvedRefundView view = view("cancel-1");
        Payment payment = pendingPayment(0);
        payment.setStatus(Payment.PaymentStatus.PAID);
        PortoneV2PaymentResponse pgPayment = payment("""
                {"status":"PARTIAL_CANCELLED","amount":{"total":10000,"cancelled":3000},
                 "cancellations":[{"id":"cancel-1","status":"SUCCEEDED","totalAmount":3000}]}
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));
        when(paymentService.confirmLedgerBackedRefund(view, 0, 3_000, "cancel-1")).thenReturn(true);

        scheduler.reconcileOne(view);

        verify(paymentService).confirmLedgerBackedRefund(view, 0, 3_000, "cancel-1");
        verify(paymentService, never()).confirmPendingRefund(any(), anyInt(), anyInt(), anyString());
        verify(refundLedgerService, never()).succeeded(20L, "cancel-1", 3_000);
        verify(reconciliationIssueService).resolveForPayment(10L);
        verify(portoneService, never()).cancelPayment(anyString(), anyInt(), anyString());
    }

    private Payment pendingPayment(int refundedAmount) {
        return Payment.builder()
                .id(10L)
                .merchantUid(MERCHANT_UID)
                .amount(10_000)
                .refundAmount(refundedAmount)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
    }

    private PortoneV2PaymentResponse payment(String json) throws Exception {
        return new ObjectMapper().readValue(json, PortoneV2PaymentResponse.class);
    }
}
