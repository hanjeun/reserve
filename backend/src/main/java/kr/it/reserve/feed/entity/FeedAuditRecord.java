package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "feed_audit_record", indexes = {
    @Index(name = "ix_feed_audit_target", columnList = "post_id,report_id,created_at,audit_id"),
    @Index(name = "ix_feed_audit_news", columnList = "promotion_id,report_id,created_at,audit_id")
})
@Getter @NoArgsConstructor
public class FeedAuditRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "audit_id") private Long id;
    @Column(name = "actor_id", nullable = false, updatable = false) private Long actorId;
    @Column(nullable = false, length = 32, updatable = false) private String action;
    @Column(name = "post_id", updatable = false) private Long postId;
    @Column(name = "promotion_id", updatable = false) private Long promotionId;
    @Column(name = "report_id", updatable = false) private Long reportId;
    @Column(length = 2000, updatable = false) private String reason;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    public static FeedAuditRecord record(Long actor, String action, Long post, Long report, String reason, LocalDateTime now) {
        FeedAuditRecord item = new FeedAuditRecord(); item.actorId = actor; item.action = action;
        item.postId = post; item.reportId = report; item.reason = reason; item.createdAt = now; return item;
    }
    public static FeedAuditRecord news(Long actor, String action, Long post, Long promotion, Long report, String reason, LocalDateTime now) {
        FeedAuditRecord item = record(actor, action, post, report, reason, now); item.promotionId = promotion; return item;
    }
}
