package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.PortoneWebhookService;
import kr.it.reserve.payment.service.RefundLedgerService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PortoneWebhookPaymentRecoveryTest {

    private static final String MERCHANT_UID = "order-webhook-paid";

    @Spy private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private PortoneService portoneService;
    @Mock private PaymentService paymentService;
    @Mock private PaymentRepository paymentRepository;
    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @InjectMocks
    private PortoneWebhookService webhookService;

    @Test
    @DisplayName("READY 결제의 PAID 웹훅은 브라우저 없이 결제 복구 관문으로 보낸다")
    void paidWebhookUsesRecoveryGate() {
        Payment payment = Payment.builder()
                .merchantUid(MERCHANT_UID)
                .status(Payment.PaymentStatus.READY)
                .build();
        PortoneV2PaymentResponse pgPayment = paidPgPayment();
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(paymentService.recoverPaidPaymentFromPg(MERCHANT_UID, pgPayment))
                .thenReturn(PaymentService.PaidRecoveryResult.RECOVERED);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService).recoverPaidPaymentFromPg(MERCHANT_UID, pgPayment);
    }

    @Test
    @DisplayName("REFUND_PENDING에서 이번 취소가 명시적으로 실패한 경우에만 원복한다")
    void explicitFailedCancellationRevertsPendingRefund() {
        Payment payment = Payment.builder()
                .id(10L)
                .merchantUid(MERCHANT_UID)
                .amount(10_000)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
        RefundAttempt pending = mock(RefundAttempt.class);
        PortoneV2PaymentResponse pgPayment = pgPayment("""
                {
                  "paymentId": "order-webhook-paid",
                  "status": "PAID",
                  "amount": {"total": 10000, "cancelled": 0},
                  "cancellations": [
                    {"id": "cancel-20", "status": "FAILED", "totalAmount": 3000}
                  ]
                }
                """);
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(refundAttemptRepository.findByPaymentIdOrderByCreatedAtAsc(10L)).thenReturn(List.of(pending));
        when(pending.isUnresolved()).thenReturn(true);
        when(pending.getId()).thenReturn(20L);
        when(pending.getRequestedAmount()).thenReturn(3_000);
        when(pending.getCancellationId()).thenReturn("cancel-20");
        when(paymentService.revertPendingRefund(
                10L, 0, "PG cancellation is explicitly FAILED"))
                .thenReturn(true);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService).revertPendingRefund(10L, 0, "PG cancellation is explicitly FAILED");
        verify(refundLedgerService).failed(20L, "PG cancellation is explicitly FAILED");
        verify(paymentService, never()).recoverPaidPaymentFromPg(MERCHANT_UID, pgPayment);
    }

    @Test
    @DisplayName("REFUND_PENDING에서 취소가 아직 REQUESTED면 PAID 상태여도 원복하지 않는다")
    void requestedCancellationRemainsPending() {
        Payment payment = pendingPayment(12L, 0);
        RefundAttempt pending = pendingAttempt(3_000, "cancel-22");
        PortoneV2PaymentResponse pgPayment = pgPayment("""
                {
                  "status": "PAID",
                  "amount": {"total": 10000, "cancelled": 0},
                  "cancellations": [
                    {"id": "cancel-22", "status": "REQUESTED", "totalAmount": 3000}
                  ]
                }
                """);
        stubPendingRefund(payment, pending, pgPayment);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService, never()).confirmPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.any());
        verify(paymentService, never()).revertPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyString());
        verify(reconciliationIssueService, never()).record(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    @DisplayName("REFUND_PENDING은 누적 취소액과 이번 취소 금액이 정확할 때 성공 확정한다")
    void exactCancellationConfirmsPendingRefund() {
        Payment payment = pendingPayment(13L, 2_000);
        RefundAttempt pending = pendingAttempt(3_000, "cancel-23");
        when(pending.getId()).thenReturn(23L);
        when(pending.getReason()).thenReturn("부분 환불");
        PortoneV2PaymentResponse pgPayment = pgPayment("""
                {
                  "status": "PARTIAL_CANCELLED",
                  "amount": {"total": 10000, "cancelled": 5000},
                  "cancellations": [
                    {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                    {"id": "cancel-23", "status": "SUCCEEDED", "totalAmount": 3000}
                  ]
                }
                """);
        stubPendingRefund(payment, pending, pgPayment);
        when(paymentService.confirmPendingRefund(13L, 2_000, 3_000, "부분 환불"))
                .thenReturn(true);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService).confirmPendingRefund(13L, 2_000, 3_000, "부분 환불");
        verify(refundLedgerService).succeeded(23L, "cancel-23", 3_000);
    }

    @Test
    @DisplayName("PG 취소 금액이 원장과 다르면 결제를 바꾸지 않고 대사 큐에 남긴다")
    void mismatchedCancellationCreatesReconciliationIssue() {
        Payment payment = pendingPayment(14L, 2_000);
        RefundAttempt pending = pendingAttempt(3_000, "cancel-24");
        PortoneV2PaymentResponse pgPayment = pgPayment("""
                {
                  "status": "PARTIAL_CANCELLED",
                  "amount": {"total": 10000, "cancelled": 4000},
                  "cancellations": [
                    {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                    {"id": "cancel-24", "status": "SUCCEEDED", "totalAmount": 2000}
                  ]
                }
                """);
        stubPendingRefund(payment, pending, pgPayment);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService, never()).confirmPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.any());
        verify(paymentService, never()).revertPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyString());
        verify(reconciliationIssueService).record(
                "REFUND:14",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                14L,
                null,
                MERCHANT_UID,
                "PG_CANCELLATION_AMOUNT_MISMATCH");
    }

    @Test
    @DisplayName("REFUND_PENDING인데 미결 원장이 없으면 조용히 버리지 않고 관리자 대사 큐에 남긴다")
    void missingRefundLedgerCreatesReconciliationIssue() {
        Payment payment = Payment.builder()
                .id(11L)
                .merchantUid(MERCHANT_UID)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
        PortoneV2PaymentResponse pgPayment = paidPgPayment();
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(refundAttemptRepository.findByPaymentIdOrderByCreatedAtAsc(11L)).thenReturn(List.of());

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(reconciliationIssueService).record(
                "REFUND:11",
                PaymentReconciliationIssue.IssueType.REFUND_LEDGER_MISSING,
                11L,
                null,
                MERCHANT_UID,
                "REFUND_PENDING_WITHOUT_UNRESOLVED_ATTEMPT");
    }

    @Test
    @DisplayName("같은 결제의 미결 환불 원장이 둘이면 웹훅이 임의의 한 건을 종결하지 않는다")
    void multipleUnresolvedRefundsRequireManualReconciliation() {
        Payment payment = pendingPayment(15L, 0);
        RefundAttempt first = mock(RefundAttempt.class);
        RefundAttempt second = mock(RefundAttempt.class);
        when(first.isUnresolved()).thenReturn(true);
        when(second.isUnresolved()).thenReturn(true);
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(paidPgPayment());
        when(refundAttemptRepository.findByPaymentIdOrderByCreatedAtAsc(15L))
                .thenReturn(List.of(first, second));

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService, never()).confirmPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.any());
        verify(paymentService, never()).revertPendingRefund(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyString());
        verify(refundLedgerService, never()).succeeded(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyInt());
        verify(refundLedgerService, never()).failed(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyString());
        verify(reconciliationIssueService).record(
                "REFUND:15",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                15L,
                null,
                MERCHANT_UID,
                "MULTIPLE_UNRESOLVED_REFUND_ATTEMPTS");
    }

    private PortoneV2PaymentResponse paidPgPayment() {
        return pgPayment("""
                {"paymentId":"order-webhook-paid","status":"PAID","amount":{"total":10000}}
                """);
    }

    private Payment pendingPayment(Long id, int refundedAmount) {
        return Payment.builder()
                .id(id)
                .merchantUid(MERCHANT_UID)
                .amount(10_000)
                .refundAmount(refundedAmount)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
    }

    private RefundAttempt pendingAttempt(int requestedAmount, String cancellationId) {
        RefundAttempt pending = mock(RefundAttempt.class);
        when(pending.isUnresolved()).thenReturn(true);
        when(pending.getRequestedAmount()).thenReturn(requestedAmount);
        when(pending.getCancellationId()).thenReturn(cancellationId);
        return pending;
    }

    private void stubPendingRefund(
            Payment payment,
            RefundAttempt pending,
            PortoneV2PaymentResponse pgPayment) {
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(refundAttemptRepository.findByPaymentIdOrderByCreatedAtAsc(payment.getId()))
                .thenReturn(List.of(pending));
    }

    private PortoneV2PaymentResponse pgPayment(String json) {
        try {
            return new ObjectMapper().readValue(json, PortoneV2PaymentResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
