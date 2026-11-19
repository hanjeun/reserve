package kr.it.reserve.moderation.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "service_report", uniqueConstraints = @UniqueConstraint(name = "uk_service_report_target", columnNames = {"target_type", "target_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceReport {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "target_type", nullable = false, length = 20)
    private TargetType targetType;
    @Column(name = "target_id", nullable = false)
    private Long targetId;
    @Column(name = "store_id", nullable = false)
    private Long storeId;
    @Column(name = "subject_member_id", nullable = false)
    private Long subjectMemberId;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status;
    @Column(nullable = false, length = 32)
    private String reason;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    @Column(name = "last_activity_at", nullable = false)
    private LocalDateTime lastActivityAt;
    @Column(name = "reviewed_by")
    private Long reviewedBy;
    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;
    @Column(name = "decision_note", length = 500)
    private String decisionNote;
    @Version @Column(nullable = false)
    private long revision;

    public void recordActivity(LocalDateTime now) {
        lastActivityAt = now;
        if (status == Status.RESOLVED || status == Status.DISMISSED) status = Status.OPEN;
    }

    public void appeal(LocalDateTime now) {
        lastActivityAt = now;
        status = Status.APPEALED;
    }

    public void decide(Status result, Long adminId, String note, LocalDateTime now) {
        status = result;
        reviewedBy = adminId;
        reviewedAt = now;
        decisionNote = note;
        lastActivityAt = now;
    }

    public enum TargetType { REVIEW, RESERVATION }
    public enum Status { OPEN, APPEALED, RESOLVED, DISMISSED }
}
