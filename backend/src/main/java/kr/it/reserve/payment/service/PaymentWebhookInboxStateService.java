package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 웹훅 inbox의 짧은 DB 트랜잭션만 담당한다.
 * PortOne 네트워크 호출은 이 서비스 밖에서 실행해 DB 연결과 행 잠금을 오래 잡지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PaymentWebhookInboxStateService {

    private static final int RETRY_BATCH_SIZE = 50;
    private static final int PROCESSING_LEASE_MINUTES = 5;

    private final PaymentWebhookInboxRepository inboxRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public InboxSnapshot register(
            String webhookId,
            String eventType,
            String merchantUid,
            String payloadSha256) {
        return inboxRepository.findByWebhookId(webhookId)
                .map(InboxSnapshot::from)
                .orElseGet(() -> InboxSnapshot.from(inboxRepository.saveAndFlush(
                        PaymentWebhookInbox.receive(
                                webhookId,
                                eventType,
                                merchantUid,
                                payloadSha256,
                                LocalDateTime.now()))));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public InboxSnapshot getRequired(String webhookId) {
        return inboxRepository.findByWebhookId(webhookId)
                .map(InboxSnapshot::from)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<InboxWork> claim(String webhookId) {
        PaymentWebhookInbox inbox = inboxRepository.findByWebhookIdForUpdate(webhookId)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"));
        LocalDateTime now = LocalDateTime.now();
        if (!inbox.canClaim(now, now.minusMinutes(PROCESSING_LEASE_MINUTES))) {
            return Optional.empty();
        }
        inbox.claim(now);
        return Optional.of(new InboxWork(inbox.getWebhookId(), inbox.getMerchantUid()));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<InboxWork> forceClaim(String webhookId) {
        PaymentWebhookInbox inbox = inboxRepository.findByWebhookIdForUpdate(webhookId)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"));
        LocalDateTime now = LocalDateTime.now();
        if (!inbox.canForceClaim(now.minusMinutes(PROCESSING_LEASE_MINUTES))) {
            return Optional.empty();
        }
        inbox.claim(now);
        return Optional.of(new InboxWork(inbox.getWebhookId(), inbox.getMerchantUid()));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markProcessed(String webhookId) {
        inboxRepository.findByWebhookIdForUpdate(webhookId)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"))
                .markProcessed(LocalDateTime.now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markIgnored(String webhookId) {
        inboxRepository.findByWebhookIdForUpdate(webhookId)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"))
                .markIgnored(LocalDateTime.now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(String webhookId, String errorType) {
        inboxRepository.findByWebhookIdForUpdate(webhookId)
                .orElseThrow(() -> new IllegalStateException("Webhook inbox row not found"))
                .markFailed(LocalDateTime.now(), errorType);
    }

    @Transactional(readOnly = true)
    public List<String> findRetryableWebhookIds() {
        LocalDateTime now = LocalDateTime.now();
        return inboxRepository.findRetryableWebhookIds(
                List.of(
                        PaymentWebhookInbox.InboxStatus.RECEIVED,
                        PaymentWebhookInbox.InboxStatus.FAILED),
                PaymentWebhookInbox.InboxStatus.PROCESSING,
                now,
                now.minusMinutes(PROCESSING_LEASE_MINUTES),
                PageRequest.of(0, RETRY_BATCH_SIZE));
    }

    public record InboxSnapshot(
            String webhookId,
            String payloadSha256,
            PaymentWebhookInbox.InboxStatus status
    ) {
        private static InboxSnapshot from(PaymentWebhookInbox inbox) {
            return new InboxSnapshot(inbox.getWebhookId(), inbox.getPayloadSha256(), inbox.getStatus());
        }
    }

    public record InboxWork(String webhookId, String merchantUid) {
    }
}
