package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

/** 댓글 수정·삭제·탈퇴와 독립된 신고 증거. 원문/회원 FK를 두지 않는다. */
@Entity @Getter @NoArgsConstructor
@Table(name = "feed_comment_report", uniqueConstraints = @UniqueConstraint(name = "uk_feed_comment_report", columnNames = {"comment_id", "reporter_id"}), indexes = {
    @Index(name = "ix_feed_comment_report_status", columnList = "status,created_at,report_id"),
    @Index(name = "ix_feed_comment_report_post", columnList = "post_id,report_id"),
    @Index(name = "ix_feed_comment_report_retention", columnList = "status,hold,resolved_at,report_id")
})
public class FeedCommentReport {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "report_id") private Long id;
    @Column(name = "comment_id", nullable = false, updatable = false) private Long commentId;
    @Column(name = "post_id", nullable = false, updatable = false) private Long postId;
    @Column(name = "reporter_id", nullable = false, updatable = false) private Long reporterId;
    @Column(nullable = false, length = 20, updatable = false) private String reason;
    @Column(length = 500, updatable = false) private String detail;
    @Column(name = "snapshot_json", nullable = false, columnDefinition = "LONGTEXT", updatable = false) private String snapshotJson;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR) @Column(nullable = false, length = 16) private FeedReport.Status status;
    @Column(nullable = false) private boolean hold;
    @Column(length = 1000) private String note;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "resolved_at") private LocalDateTime resolvedAt;
    @Version @Column(nullable = false) private long revision;
    public static FeedCommentReport create(FeedComment comment, Long reporter, String reason, String detail, String snapshot, LocalDateTime now) {
        FeedCommentReport item = new FeedCommentReport(); item.commentId = comment.getId(); item.postId = comment.getPost().getId();
        item.reporterId = reporter; item.reason = reason; item.detail = detail; item.snapshotJson = snapshot;
        item.status = FeedReport.Status.OPEN; item.createdAt = now; return item;
    }
    public void review(FeedReport.Status state, boolean hold, String note, LocalDateTime now) {
        if (state == FeedReport.Status.OPEN) resolvedAt = null;
        else if (status != FeedReport.Status.RESOLVED || this.hold && !hold) resolvedAt = now;
        status = state; this.hold = hold; this.note = note;
    }
}
