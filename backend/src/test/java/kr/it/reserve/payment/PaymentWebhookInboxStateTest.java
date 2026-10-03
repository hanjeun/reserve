package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

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

    @Test
    @DisplayName("서비스의 수동 재시도는 backoff만 건너뛰고 살아 있는 처리 lease를 다시 획득하지 않는다")
    void manualRetryBypassesBackoffWithoutClaimingAnActiveLeaseTwice() {
        String webhookId = "wh-manual-retry";
        LocalDateTime failedAt = LocalDateTime.now();
        PaymentWebhookInbox inbox = PaymentWebhookInbox.receive(
                webhookId, "Transaction.Paid", "order-manual-retry", "d".repeat(64), failedAt);
        inbox.claim(failedAt);
        inbox.markFailed(failedAt, "TemporaryGatewayFailure");
        LocalDateTime retryAt = inbox.getNextRetryAt();
        PaymentWebhookInboxRepository repository = mock(PaymentWebhookInboxRepository.class);
        when(repository.findByWebhookIdForUpdate(webhookId)).thenReturn(Optional.of(inbox));
        PaymentWebhookInboxStateService state = new PaymentWebhookInboxStateService(repository);

        assertThat(state.claim(webhookId)).isEmpty();
        assertThat(inbox.getStatus()).isEqualTo(PaymentWebhookInbox.InboxStatus.FAILED);
        assertThat(inbox.getAttemptCount()).isEqualTo(1);
        assertThat(inbox.getNextRetryAt()).isEqualTo(retryAt);
        LocalDateTime beforeClaim = LocalDateTime.now();
        assertThat(state.forceClaim(webhookId)).contains(
                new PaymentWebhookInboxStateService.InboxWork(webhookId, "order-manual-retry"));

        assertThat(inbox.getStatus()).isEqualTo(PaymentWebhookInbox.InboxStatus.PROCESSING);
        assertThat(inbox.getAttemptCount()).isEqualTo(2);
        assertThat(inbox.getNextRetryAt()).isNull();
        assertThat(inbox.getLastErrorType()).isNull();
        LocalDateTime claimedAt = inbox.getLastAttemptAt();
        assertThat(claimedAt).isBetween(beforeClaim, LocalDateTime.now());
        assertThat(state.forceClaim(webhookId)).isEmpty();
        assertThat(inbox.getAttemptCount()).isEqualTo(2);
        assertThat(inbox.getLastAttemptAt()).isEqualTo(claimedAt);
        verify(repository, times(3)).findByWebhookIdForUpdate(webhookId);
        verifyNoMoreInteractions(repository);
    }

    @ParameterizedTest
    @EnumSource(value = PaymentWebhookInbox.InboxStatus.class, names = {"PROCESSED", "IGNORED"})
    @DisplayName("서비스가 닫은 웹훅은 완료 시각을 보존하고 늦은 실패나 중복 재시도로 다시 열리지 않는다")
    void serviceCompletionIsTerminalAndIdempotent(PaymentWebhookInbox.InboxStatus terminalStatus) {
        String webhookId = "wh-terminal-contract";
        LocalDateTime failedAt = LocalDateTime.now();
        PaymentWebhookInbox inbox = PaymentWebhookInbox.receive(
                webhookId, "Transaction.Paid", "order-terminal-contract", "e".repeat(64), failedAt);
        inbox.claim(failedAt);
        inbox.markFailed(failedAt, "TemporaryGatewayFailure");
        PaymentWebhookInboxRepository repository = mock(PaymentWebhookInboxRepository.class);
        when(repository.findByWebhookIdForUpdate(webhookId)).thenReturn(Optional.of(inbox));
        PaymentWebhookInboxStateService state = new PaymentWebhookInboxStateService(repository);

        LocalDateTime beforeCompletion = LocalDateTime.now();
        if (terminalStatus == PaymentWebhookInbox.InboxStatus.PROCESSED) {
            state.markProcessed(webhookId);
        } else {
            state.markIgnored(webhookId);
        }

        assertThat(inbox.getStatus()).isEqualTo(terminalStatus);
        assertThat(inbox.getNextRetryAt()).isNull();
        assertThat(inbox.getLastErrorType()).isNull();
        LocalDateTime completedAt = inbox.getProcessedAt();
        assertThat(completedAt).isBetween(beforeCompletion, LocalDateTime.now());
        state.markProcessed(webhookId);
        state.markIgnored(webhookId);
        state.markFailed(webhookId, "LateGatewayFailure");
        assertThat(state.claim(webhookId)).isEmpty();
        assertThat(state.forceClaim(webhookId)).isEmpty();
        assertThat(inbox.getStatus()).isEqualTo(terminalStatus);
        assertThat(inbox.getProcessedAt()).isEqualTo(completedAt);
        assertThat(inbox.getAttemptCount()).isEqualTo(1);
        assertThat(inbox.getNextRetryAt()).isNull();
        assertThat(inbox.getLastErrorType()).isNull();
        verify(repository, times(6)).findByWebhookIdForUpdate(webhookId);
        verifyNoMoreInteractions(repository);
    }
}
