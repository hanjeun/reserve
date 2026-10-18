package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import java.time.LocalDateTime;

@Entity @Getter @NoArgsConstructor
@Table(name = "feed_notification", uniqueConstraints = @UniqueConstraint(name = "uk_feed_notification_event", columnNames = {"member_id", "actor_profile_id", "comment_id", "kind"}), indexes = {
    @Index(name = "ix_feed_notification_member", columnList = "member_id,read_at,created_at,notification_id")
})
public class FeedNotification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "notification_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "member_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private Member recipient;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_profile_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private FeedProfile actor;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "comment_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private FeedComment comment;
    @Column(nullable = false, length = 20, updatable = false) private String kind;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "read_at") private LocalDateTime readAt;
    public static FeedNotification create(Member recipient, FeedProfile actor, FeedComment comment, String kind, LocalDateTime now) {
        FeedNotification item = new FeedNotification(); item.recipient = recipient; item.actor = actor; item.comment = comment;
        item.kind = kind; item.createdAt = now; return item;
    }
    public void read(LocalDateTime now) { if (readAt == null) readAt = now; }
}
