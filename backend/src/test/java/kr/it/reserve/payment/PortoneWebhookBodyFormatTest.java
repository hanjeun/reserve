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
 * 웹훅 <b>본문 형식</b>에서 결제 식별자를 뽑아내는 부분.
 *
 * <h2>왜 이 테스트가 있나 — 2026-08-24</h2>
 * 포트원 콘솔의 웹훅 등록 화면에는 <b>버전 드롭다운</b>이 있고, 신규 등록 시 기본값이
 * 구버전({@code 2024-01-01})이다. 두 버전은 본문 구조가 완전히 다르다:
 *
 * <pre>
 * 2024-04-25   {"type":"...","data":{"paymentId":"..."}}
 * 2024-01-01   {"payment_id":"...","tx_id":"...","status":"Ready"}
 * </pre>
 *
 * 예전 코드는 {@code data.paymentId} 만 읽었다. 콘솔에서 구버전이 선택돼 있으면
 * <b>서명 검증은 통과하고 본문만 조용히 버려진다.</b> 컨트롤러는 200 을 주므로
 * 포트원 콘솔에는 "정상 전송"으로 찍히고 재전송도 오지 않는다 —
 * <b>어느 쪽 로그에도 에러가 남지 않는</b> 고장이다.
 *
 * <p>그래서 이 테스트는 "두 형식 모두에서 같은 결제 ID를 inbox에 남긴다"를 계약으로 고정한다.
 * 실제 PG 조회는 durable inbox에 저장된 뒤에만 일어나야 한다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는다 — 검증 대상이 JSON 파싱뿐이다.
 * {@code getPaymentInfo} 가 <b>어떤 식별자로 호출됐는지</b>까지만 보고 멈춘다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PortoneWebhookBodyFormatTest {

    private static final String PAYMENT_ID = "reserve-20260824-0001";

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();
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
