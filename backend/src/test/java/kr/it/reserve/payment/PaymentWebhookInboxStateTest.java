package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class PaymentWebhookInboxStateTest {

    @Test
    @DisplayName("실패한 웹훅은 즉시 완료 처리되지 않고 backoff 뒤 재시도할 수 있다")
    void failedWebhookBecomesRetryableAfterBackoff() {
        LocalDateTime receivedAt = LocalDateTime.of(2026, 9, 1, 0, 0);
        PaymentWebhookInbox inbox = PaymentWebhookInbox.receive(
                "wh-1", "Transaction.Paid", "order-1", "a".repeat(64), receivedAt);

        assertThat(inbox.canClaim(receivedAt, receivedAt.minusMinutes(5))).isTrue();
        inbox.claim(receivedAt);
        inbox.markFailed(receivedAt, "PaymentException");

        assertThat(inbox.getStatus()).isEqualTo(PaymentWebhookInbox.InboxStatus.FAILED);
        assertThat(inbox.getAttemptCount()).isEqualTo(1);
        assertThat(inbox.getLastErrorType()).isEqualTo("PaymentException");
        assertThat(inbox.canClaim(receivedAt.plusSeconds(30), receivedAt.minusMinutes(5))).isFalse();
        assertThat(inbox.canForceClaim(receivedAt.minusMinutes(5))).isTrue();
        assertThat(inbox.canClaim(receivedAt.plusMinutes(1), receivedAt.minusMinutes(5))).isTrue();
    }

    @Test
    @DisplayName("완료된 웹훅은 중복 수신되어도 다시 claim할 수 없다")
    void processedWebhookIsTerminal() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 1, 0, 0);
        PaymentWebhookInbox inbox = PaymentWebhookInbox.receive(
                "wh-2", "Transaction.Paid", "order-2", "b".repeat(64), now);

        inbox.claim(now);
        inbox.markProcessed(now.plusSeconds(1));

        assertThat(inbox.isTerminal()).isTrue();
        assertThat(inbox.canClaim(now.plusDays(1), now)).isFalse();
    }

    @Test
    @DisplayName("반복 실패한 웹훅은 최대 한 시간까지 기다린 뒤 다시 처리할 수 있다")
    void repeatedFailuresKeepRetryDelayWithinOneHour() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 3, 0, 0);
        PaymentWebhookInbox inbox = PaymentWebhookInbox.receive(
                "wh-retry", "Transaction.Paid", "order-retry", "c".repeat(64), now);

        for (int attempt = 1; attempt <= 9; attempt++) {
            assertThat(inbox.canClaim(now, now.minusMinutes(5))).isTrue();
            inbox.claim(now);
            inbox.markFailed(now, "TemporaryGatewayFailure");

            LocalDateTime retryAt = inbox.getNextRetryAt();
            assertThat(retryAt).isAfter(now).isBeforeOrEqualTo(now.plusHours(1));
            assertThat(inbox.canClaim(retryAt.minusSeconds(1), now.minusMinutes(5))).isFalse();
            assertThat(inbox.canClaim(retryAt, now.minusMinutes(5))).isTrue();
            if (attempt >= 7) {
                assertThat(retryAt).isEqualTo(now.plusHours(1));
            }
            now = retryAt;
        }

        inbox.claim(now);
        inbox.markProcessed(now.plusSeconds(1));
        assertThat(inbox.isTerminal()).isTrue();
        assertThat(inbox.canClaim(now.plusDays(1), now)).isFalse();
    }
}
