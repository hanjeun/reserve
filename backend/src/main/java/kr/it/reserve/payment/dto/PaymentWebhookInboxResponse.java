package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.PaymentWebhookInbox;

import java.time.LocalDateTime;

/** 웹훅 원문과 payload hash를 제외한 관리자 운영 응답. */
public record PaymentWebhookInboxResponse(
        Long id,
        String webhookId,
        String eventType,
        String merchantUid,
        String status,
        int attemptCount,
        String lastErrorType,
        LocalDateTime receivedAt,
        LocalDateTime lastAttemptAt,
        LocalDateTime nextRetryAt,
        LocalDateTime processedAt
) {
    public static PaymentWebhookInboxResponse from(PaymentWebhookInbox inbox) {
        return new PaymentWebhookInboxResponse(
                inbox.getId(),
                inbox.getWebhookId(),
                inbox.getEventType(),
                inbox.getMerchantUid(),
                inbox.getStatus().name(),
                inbox.getAttemptCount(),
                inbox.getLastErrorType(),
                inbox.getReceivedAt(),
                inbox.getLastAttemptAt(),
                inbox.getNextRetryAt(),
                inbox.getProcessedAt());
    }
}
