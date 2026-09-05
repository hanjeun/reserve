package kr.it.reserve.payment.service;

import kr.it.reserve.payment.dto.PortoneWebhookSignal;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService.InboxSnapshot;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService.InboxWork;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;

/**
 * 서명 검증 이후의 웹훅 수신·처리 관문.
 * 먼저 inbox를 커밋하고, 그 다음 PG 권위 상태를 조회해 적용한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentWebhookInboxProcessor {

    private final PaymentWebhookInboxStateService inboxStateService;
    private final PortoneWebhookService webhookService;

    public void receive(String webhookId, String rawBody) {
        PortoneWebhookSignal signal = webhookService.parseSignal(rawBody);
        String payloadSha256 = sha256(rawBody);

        InboxSnapshot inbox;
        try {
            inbox = inboxStateService.register(
                    webhookId,
                    signal.eventType(),
                    signal.merchantUid(),
                    payloadSha256);
        } catch (DataIntegrityViolationException duplicateRace) {
            // 같은 webhook-id가 동시에 처음 도착한 경우 unique 제약이 한 건만 남긴다.
            // 실패한 삽입 트랜잭션 밖에서 이미 커밋된 행을 다시 읽는다.
            inbox = inboxStateService.getRequired(webhookId);
        }

        if (!payloadSha256.equals(inbox.payloadSha256())) {
            // 같은 ID의 다른 본문을 적용하지 않는다. 최초로 서명 검증·저장된 신호만 처리한다.
            log.error("PortOne webhook id reused with a different payload: webhookId={}", webhookId);
        }

        process(webhookId);
    }

    public void retry(String webhookId) {
        process(webhookId, false);
    }

    public void retryNow(String webhookId) {
        process(webhookId, true);
    }

    private void process(String webhookId) {
        process(webhookId, false);
    }

    private void process(String webhookId, boolean force) {
        Optional<InboxWork> claimed = force
                ? inboxStateService.forceClaim(webhookId)
                : inboxStateService.claim(webhookId);
        if (claimed.isEmpty()) {
            return;
        }

        InboxWork work = claimed.get();
        if (work.merchantUid() == null || work.merchantUid().isBlank()) {
            inboxStateService.markIgnored(webhookId);
            log.warn("PortOne webhook ignored - no payment id: webhookId={}", webhookId);
            return;
        }

        try {
            webhookService.processMerchantUid(work.merchantUid());
            inboxStateService.markProcessed(webhookId);
        } catch (RuntimeException e) {
            try {
                inboxStateService.markFailed(webhookId, e.getClass().getSimpleName());
            } catch (RuntimeException stateError) {
                log.error("PortOne webhook failure state could not be persisted: webhookId={}, errorType={}",
                        webhookId, stateError.getClass().getSimpleName());
            }
            throw e;
        }
    }

    private String sha256(String rawBody) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawBody.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
