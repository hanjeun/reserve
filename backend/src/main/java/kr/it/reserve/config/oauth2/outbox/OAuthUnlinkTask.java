package kr.it.reserve.config.oauth2.outbox;

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
import kr.it.reserve.member.entity.AuthProvider;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 회원 탈퇴 커밋과 외부 OAuth 해제를 잇는 durable outbox. */
@Entity
@Table(
        name = "oauth_unlink_task",
        uniqueConstraints = @UniqueConstraint(name = "uk_oauth_unlink_task_key", columnNames = "task_key"),
        indexes = @Index(name = "idx_oauth_unlink_retry", columnList = "status,next_attempt_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OAuthUnlinkTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "oauth_unlink_task_id")
    private Long id;

    /** 회원별·provider별 중복 enqueue를 막는 비식별 SHA-256 키. */
    @Column(name = "task_key", nullable = false, length = 64)
    private String taskKey;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private AuthProvider provider;

    /** AES-GCM 암호문. 완료 즉시 null로 지워 자격 증명 보존을 최소화한다. */
    @Column(name = "encrypted_access_token", columnDefinition = "TEXT")
    private String encryptedAccessToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    @Column(name = "last_error_type", length = 100)
    private String lastErrorType;

    /** 진행 중 작업의 소유권. lease 만료 뒤 다른 실행기가 회수하면 이전 결과는 무시한다. */
    @Column(name = "lease_id", length = 36)
    private String leaseId;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static OAuthUnlinkTask pending(
            String taskKey,
            Long memberId,
            AuthProvider provider,
            String encryptedAccessToken,
            LocalDateTime now) {
        OAuthUnlinkTask task = new OAuthUnlinkTask();
        task.taskKey = taskKey;
        task.memberId = memberId;
        task.provider = provider;
        task.encryptedAccessToken = encryptedAccessToken;
        task.status = encryptedAccessToken == null ? Status.BLOCKED : Status.PENDING;
        task.attemptCount = 0;
        task.nextAttemptAt = now;
        task.lastErrorType = encryptedAccessToken == null ? "TOKEN_MISSING" : null;
        return task;
    }

    public boolean canClaim(LocalDateTime now) {
        return (status == Status.PENDING || status == Status.FAILED || status == Status.PROCESSING)
                && !nextAttemptAt.isAfter(now);
    }

    public void markProcessing(LocalDateTime leaseUntil, String nextLeaseId) {
        status = Status.PROCESSING;
        nextAttemptAt = leaseUntil;
        leaseId = nextLeaseId;
    }

    public boolean ownsLease(String candidateLeaseId) {
        return status == Status.PROCESSING && leaseId != null && leaseId.equals(candidateLeaseId);
    }

    public void markCompleted(LocalDateTime now) {
        status = Status.COMPLETED;
        completedAt = now;
        nextAttemptAt = now;
        lastErrorType = null;
        leaseId = null;
        encryptedAccessToken = null;
    }

    public void markFailed(LocalDateTime now, String errorType) {
        status = Status.FAILED;
        attemptCount++;
        long delayMinutes = Math.min(360L, 1L << Math.min(attemptCount, 8));
        nextAttemptAt = now.plusMinutes(delayMinutes);
        lastErrorType = truncate(errorType);
        leaseId = null;
    }

    private String truncate(String value) {
        if (value == null) return null;
        return value.length() <= 100 ? value : value.substring(0, 100);
    }

    public enum Status {
        PENDING,
        FAILED,
        PROCESSING,
        BLOCKED,
        COMPLETED
    }
}
