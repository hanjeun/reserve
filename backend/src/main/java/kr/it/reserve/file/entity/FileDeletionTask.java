package kr.it.reserve.file.entity;

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

/**
 * DB 변경과 S3 삭제 사이를 잇는 durable outbox.
 *
 * <p>S3 삭제를 비즈니스 트랜잭션 안에서 바로 실행하면 두 상태를 원자적으로 맞출 수 없다.
 * S3는 지워졌는데 DB가 롤백되거나, DB는 커밋됐는데 S3 호출이 실패할 수 있기 때문이다.
 * 삭제 의도를 DB에 먼저 커밋하고 이 행을 멱등 재시도하는 방식으로 경계를 분리한다.
 */
@Entity
@Table(
        name = "file_deletion_task",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_file_deletion_target_hash",
                columnNames = "target_hash"),
        indexes = @Index(
                name = "idx_file_deletion_retry",
                columnList = "status,next_attempt_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class FileDeletionTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "file_deletion_task_id")
    private Long id;

    /** 완료 전까지만 보관한다. 완료 시 null로 지워 경로 자체의 보존을 최소화한다. */
    @Column(name = "target", length = 2048)
    private String target;

    /** URL/키 대신 이 값에 unique를 걸어 긴 인덱스와 중복 삭제를 피한다. */
    @Column(name = "target_hash", nullable = false, length = 64)
    private String targetHash;

    @Column(name = "source_type", nullable = false, length = 40)
    private String sourceType;

    @Column(name = "source_id")
    private Long sourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "varchar(20)")
    private Status status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    @Column(name = "last_error_type", length = 100)
    private String lastErrorType;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static FileDeletionTask pending(
            String target,
            String targetHash,
            String sourceType,
            Long sourceId,
            LocalDateTime now) {
        FileDeletionTask task = new FileDeletionTask();
        task.target = target;
        task.targetHash = targetHash;
        task.sourceType = sourceType;
        task.sourceId = sourceId;
        task.status = Status.PENDING;
        task.attemptCount = 0;
        task.nextAttemptAt = now;
        return task;
    }

    public boolean canAttempt(LocalDateTime now) {
        return status != Status.COMPLETED && !nextAttemptAt.isAfter(now);
    }

    public void markCompleted(LocalDateTime now) {
        status = Status.COMPLETED;
        completedAt = now;
        nextAttemptAt = now;
        lastErrorType = null;
        target = null;
    }

    public void markFailed(LocalDateTime now, String errorType) {
        status = Status.FAILED;
        attemptCount++;
        long delayMinutes = Math.min(360L, 1L << Math.min(attemptCount, 8));
        nextAttemptAt = now.plusMinutes(delayMinutes);
        lastErrorType = truncate(errorType);
    }

    private String truncate(String value) {
        if (value == null) return null;
        return value.length() <= 100 ? value : value.substring(0, 100);
    }

    public enum Status {
        PENDING,
        FAILED,
        COMPLETED
    }
}
