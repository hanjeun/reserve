package kr.it.reserve.moderation.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "service_report_entry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceReportEntry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "report_id", nullable = false)
    private Long reportId;
    @Column(name = "actor_id", nullable = false)
    private Long actorId;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 12)
    private Kind kind;
    @Column(length = 32)
    private String reason;
    @Column(nullable = false, length = 500)
    private String details;
    @Column(length = 1400)
    private String evidence;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public ServiceReportEntry(Long reportId, Long actorId, Kind kind, String reason, String details, String evidence, LocalDateTime now) {
        this.reportId = reportId;
        this.actorId = actorId;
        this.kind = kind;
        this.reason = reason;
        this.details = details;
        this.evidence = evidence;
        this.createdAt = now;
    }

    public enum Kind { REPORT, APPEAL, DECISION }
}
