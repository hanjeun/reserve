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
    @DisplayName("REFUND_PENDING에서 PG가 PAID면 초기결제 복구가 아니라 미결 환불 실패로 원복한다")
    void paidPgStateSettlesPendingRefundFirst() {
        Payment payment = Payment.builder()
                .id(10L)
                .merchantUid(MERCHANT_UID)
                .status(Payment.PaymentStatus.REFUND_PENDING)
                .build();
        RefundAttempt pending = mock(RefundAttempt.class);
        PortoneV2PaymentResponse pgPayment = paidPgPayment();
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);
        when(paymentRepository.findByMerchantUid(MERCHANT_UID)).thenReturn(Optional.of(payment));
        when(refundAttemptRepository.findByPaymentIdOrderByCreatedAtAsc(10L)).thenReturn(List.of(pending));
        when(pending.isUnresolved()).thenReturn(true);
        when(pending.getId()).thenReturn(20L);

        webhookService.processMerchantUid(MERCHANT_UID);

        verify(paymentService).revertPendingRefund(10L,
                "PG reports PAID via webhook after cancellation request");
        verify(refundLedgerService).failed(20L,
                "PG reports PAID via webhook after cancellation request");
        verify(paymentService, never()).recoverPaidPaymentFromPg(MERCHANT_UID, pgPayment);
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

    private PortoneV2PaymentResponse paidPgPayment() {
        try {
            return new ObjectMapper().readValue("""
                    {"paymentId":"order-webhook-paid","status":"PAID","amount":{"total":10000}}
                    """, PortoneV2PaymentResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
