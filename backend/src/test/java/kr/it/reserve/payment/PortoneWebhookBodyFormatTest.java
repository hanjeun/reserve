package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneWebhookSignal;
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
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.Spy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 2024-04-25(data.paymentId)와 2024-01-01(payment_id) 규격이 같은 결제 ID를 inbox에 남기는지 확인한다.
 * 실제 PG 조회는 inbox 저장 뒤에만 수행하며 이 시험에서는 실행하지 않는다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PortoneWebhookBodyFormatTest {

    private static final String PAYMENT_ID = "reserve-20260824-0001";

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private kr.it.reserve.advertisement.service.AdPaymentService adPaymentService;
    @Mock private PortoneService portoneService;
    @Mock private PaymentService paymentService;
    @Mock private PaymentRepository paymentRepository;
    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @InjectMocks
    private PortoneWebhookService webhookService;

    @Test
    @DisplayName("★ 2024-04-25 (권장) — data.paymentId 로 결제를 찾는다")
    void 신버전_본문() {
        PortoneWebhookSignal signal = webhookService.parseSignal("""
                {"type":"Transaction.Cancelled","timestamp":"2026-08-24T10:00:00.000Z",
                 "data":{"paymentId":"%s","storeId":"store-x","transactionId":"tx-1"}}
                """.formatted(PAYMENT_ID));

        assertThat(signal.validJson()).isTrue();
        assertThat(signal.eventType()).isEqualTo("Transaction.Cancelled");
        assertThat(signal.merchantUid()).isEqualTo(PAYMENT_ID);
        verifyNoInteractions(portoneService);
    }

    @Test
    @DisplayName("★ 2024-01-01 (구) — payment_id 로도 같은 결제를 찾는다. 콘솔 기본값이 이쪽이다")
    void 구버전_본문() {
        PortoneWebhookSignal signal = webhookService.parseSignal("""
                {"payment_id":"%s","tx_id":"tx-1","status":"Ready"}
                """.formatted(PAYMENT_ID));

        assertThat(signal.validJson()).isTrue();
        assertThat(signal.merchantUid()).isEqualTo(PAYMENT_ID);
        verifyNoInteractions(portoneService);
    }

    @Test
    @DisplayName("식별자가 없으면 조회하지 않는다 — 다른 상점·다른 이벤트의 웹훅일 수 있다")
    void 식별자_없음() {
        PortoneWebhookSignal signal = webhookService.parseSignal("""
                {"type":"BillingKey.Issued","data":{"billingKey":"bk-1"}}
                """);

        assertThat(signal.validJson()).isTrue();
        assertThat(signal.eventType()).isEqualTo("BillingKey.Issued");
        assertThat(signal.merchantUid()).isNull();
        verifyNoInteractions(portoneService);
    }

    @Test
    @DisplayName("JSON 이 아니면 예외를 밖으로 내보내지 않는다 — 재전송을 유발할 이유가 없다")
    void 깨진_본문() {
        PortoneWebhookSignal signal = webhookService.parseSignal("not json at all");

        assertThat(signal.validJson()).isFalse();
        assertThat(signal.merchantUid()).isNull();
        verifyNoInteractions(portoneService);
    }
}
