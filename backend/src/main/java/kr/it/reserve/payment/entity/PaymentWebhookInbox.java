package kr.it.reserve.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * 서명 검증을 통과한 PortOne 웹훅의 durable inbox.
 *
 * <p>원문 payload는 저장하지 않는다. 웹훅은 결제 ID를 신호로만 사용하고 실제 상태는
 * PortOne 조회 API에서 다시 읽으므로, 재처리에 필요한 것은 웹훅 ID와 결제 ID뿐이다.
 * payload SHA-256은 같은 웹훅 ID가 다른 본문으로 재사용되는 이상 상황을 탐지한다.
 */
@Entity
@Table(
        name = "payment_webhook_inbox",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_payment_webhook_inbox_webhook_id",
                columnNames = "webhook_id"),
        indexes = {
                @Index(name = "idx_payment_webhook_inbox_retry", columnList = "status,next_retry_at"),
                @Index(name = "idx_payment_webhook_inbox_merchant_uid", columnList = "merchant_uid")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PaymentWebhookInbox {

    private static final int MAX_BACKOFF_MINUTES = 60;
    private static final int MAX_BACKOFF_SHIFT = 6;

    /** 아직 자동 처리가 끝나지 않아 관리자 목록에 남겨야 하는 상태의 단일 정본. */
    public static final Set<InboxStatus> UNFINISHED = Collections.unmodifiableSet(
            EnumSet.of(InboxStatus.RECEIVED, InboxStatus.PROCESSING, InboxStatus.FAILED));

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "webhook_inbox_id")
    private Long id;

    @Column(name = "webhook_id", nullable = false, length = 255)
    private String webhookId;

    @Column(name = "event_type", length = 100)
    private String eventType;

    @Column(name = "merchant_uid", length = 255)
    private String merchantUid;

    @Column(name = "payload_sha256", nullable = false, length = 64)
    private String payloadSha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private InboxStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_attempt_at")
    private LocalDateTime lastAttemptAt;

    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Column(name = "last_error_type", length = 100)
    private String lastErrorType;

    @CreatedDate
    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static PaymentWebhookInbox receive(
            String webhookId,
            String eventType,
            String merchantUid,
            String payloadSha256,
            LocalDateTime now) {
        PaymentWebhookInbox inbox = new PaymentWebhookInbox();
        inbox.webhookId = webhookId;
        inbox.eventType = eventType;
        inbox.merchantUid = merchantUid;
        inbox.payloadSha256 = payloadSha256;
        inbox.status = InboxStatus.RECEIVED;
        inbox.attemptCount = 0;
        inbox.nextRetryAt = now;
        return inbox;
    }

    public boolean isTerminal() {
        return status == InboxStatus.PROCESSED || status == InboxStatus.IGNORED;
    }

    public boolean canClaim(LocalDateTime now, LocalDateTime staleBefore) {
        if (isTerminal()) {
            return false;
        }
        if (status == InboxStatus.PROCESSING) {
            return lastAttemptAt == null || lastAttemptAt.isBefore(staleBefore);
        }
        return nextRetryAt == null || !nextRetryAt.isAfter(now);
    }

    /** 관리자 수동 재시도는 backoff만 건너뛰고, 완료 건과 살아 있는 처리 lease는 건드리지 않는다. */
    public boolean canForceClaim(LocalDateTime staleBefore) {
        if (isTerminal()) {
            return false;
        }
        return status != InboxStatus.PROCESSING
                || lastAttemptAt == null
                || lastAttemptAt.isBefore(staleBefore);
    }

    public void claim(LocalDateTime now) {
        status = InboxStatus.PROCESSING;
        attemptCount++;
        lastAttemptAt = now;
        nextRetryAt = null;
        lastErrorType = null;
    }

    public void markProcessed(LocalDateTime now) {
        if (isTerminal()) {
            return;
        }
        status = InboxStatus.PROCESSED;
        processedAt = now;
        nextRetryAt = null;
        lastErrorType = null;
    }

    public void markIgnored(LocalDateTime now) {
        if (isTerminal()) {
            return;
        }
        status = InboxStatus.IGNORED;
        processedAt = now;
        nextRetryAt = null;
        lastErrorType = null;
    }

    public void markFailed(LocalDateTime now, String errorType) {
        if (isTerminal()) {
            return;
        }
        status = InboxStatus.FAILED;
        lastErrorType = truncate(errorType);
        long delayMinutes = Math.min(
                MAX_BACKOFF_MINUTES,
                1L << Math.min(Math.max(attemptCount - 1, 0), MAX_BACKOFF_SHIFT));
        nextRetryAt = now.plusMinutes(delayMinutes);
    }

    private String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 100 ? value : value.substring(0, 100);
    }

    public enum InboxStatus {
        RECEIVED,
        PROCESSING,
        PROCESSED,
        IGNORED,
        FAILED
    }
}
