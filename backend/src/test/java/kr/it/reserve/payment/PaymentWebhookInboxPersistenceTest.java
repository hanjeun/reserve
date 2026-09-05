package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class PaymentWebhookInboxPersistenceTest {

    @Autowired private PaymentWebhookInboxStateService inboxStateService;
    @Autowired private PaymentWebhookInboxRepository inboxRepository;

    @BeforeEach
    @AfterEach
    void clearInbox() {
        inboxRepository.deleteAll();
    }

    @Test
    @DisplayName("inbox를 먼저 커밋하고 같은 webhook-id는 한 행으로 멱등 등록한다")
    void inboxRegistrationIsDurableAndIdempotent() {
        String payloadHash = "a".repeat(64);

        inboxStateService.register(
                "wh-persistence-1",
                "Transaction.Paid",
                "order-persistence-1",
                payloadHash);
        inboxStateService.register(
                "wh-persistence-1",
                "Transaction.Paid",
                "order-persistence-1",
                payloadHash);

        assertThat(inboxRepository.count()).isOne();
        PaymentWebhookInbox inbox = inboxRepository.findByWebhookId("wh-persistence-1").orElseThrow();
        assertThat(inbox.getStatus()).isEqualTo(PaymentWebhookInbox.InboxStatus.RECEIVED);
        assertThat(inbox.getReceivedAt()).isNotNull();
        assertThat(inbox.getUpdatedAt()).isNotNull();

        assertThat(inboxStateService.claim("wh-persistence-1")).isPresent();
        inboxStateService.markFailed("wh-persistence-1", "TemporaryFailure");

        PaymentWebhookInbox failed = inboxRepository.findByWebhookId("wh-persistence-1").orElseThrow();
        assertThat(failed.getStatus()).isEqualTo(PaymentWebhookInbox.InboxStatus.FAILED);
        assertThat(failed.getAttemptCount()).isEqualTo(1);
        assertThat(failed.getNextRetryAt()).isNotNull();
    }
}
