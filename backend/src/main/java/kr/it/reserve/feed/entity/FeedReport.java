package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity
@Table(name = "feed_report", uniqueConstraints = {
    @UniqueConstraint(name = "uk_feed_report_target", columnNames = {"post_id", "reporter_id"}),
    @UniqueConstraint(name = "uk_feed_report_news", columnNames = {"promotion_id", "reporter_id"})}, indexes = {
    @Index(name = "ix_feed_report_status", columnList = "status,created_at,report_id"),
    @Index(name = "ix_feed_report_retention", columnList = "status,hold,resolved_at,report_id")
})
@Getter @NoArgsConstructor
public class FeedReport {
    public enum Status { OPEN, RESOLVED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "report_id") private Long id;
    // 독립 스냅샷이다. 원문 파기 뒤에도 post/member FK로 다시 묶지 않는다.
    @Column(name = "post_id", updatable = false) private Long postId;
    @Column(name = "promotion_id", updatable = false) private Long promotionId;
    @Column(name = "reporter_id", nullable = false, updatable = false) private Long reporterId;
    @Column(nullable = false, length = 20, updatable = false) private String reason;
    @Column(length = 500, updatable = false) private String detail;
    @Column(name = "snapshot_json", nullable = false, columnDefinition = "LONGTEXT", updatable = false) private String snapshotJson;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR) @Column(nullable = false, length = 16) private Status status;
    @Column(nullable = false) private boolean hold;
    @Column(length = 1000) private String note;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "resolved_at") private LocalDateTime resolvedAt;
    @Version @Column(nullable = false) private long revision;
    public static FeedReport create(Long postId, Long reporterId, String reason, String detail, String snapshot, LocalDateTime now) {
        FeedReport report = new FeedReport(); report.postId = postId; report.reporterId = reporterId;
        report.reason = reason; report.detail = detail; report.snapshotJson = snapshot; report.status = Status.OPEN; report.createdAt = now; return report;
    }
    public static FeedReport createNews(Long postId, Long promotionId, Long reporterId, String reason, String detail, String snapshot, LocalDateTime now) {
        FeedReport report = create(postId, reporterId, reason, detail, snapshot, now); report.promotionId = promotionId; return report;
    }
    public void review(Status status, boolean hold, String note, LocalDateTime now) {
        if (status == Status.OPEN) resolvedAt = null;
        else if (this.status != Status.RESOLVED || (this.hold && !hold)) resolvedAt = now;
        this.status = status; this.hold = hold; this.note = note;
    }
}
