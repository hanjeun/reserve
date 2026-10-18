package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.promotion.entity.Promotion;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Check;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import java.time.LocalDateTime;

@Entity @Getter @NoArgsConstructor
@Table(name = "content_like", uniqueConstraints = {
    @UniqueConstraint(name = "uk_content_like_post", columnNames = {"member_id", "post_id"}),
    @UniqueConstraint(name = "uk_content_like_news", columnNames = {"member_id", "promotion_id"}),
    @UniqueConstraint(name = "uk_content_like_comment", columnNames = {"member_id", "comment_id"})}, indexes = {
    @Index(name = "ix_content_like_member", columnList = "member_id,created_at,like_id")
})
@Check(name = "ck_content_like_target", constraints = "(post_id IS NOT NULL AND promotion_id IS NULL AND comment_id IS NULL) OR (post_id IS NULL AND promotion_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND promotion_id IS NULL AND comment_id IS NOT NULL)")
public class ContentLike {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "like_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "member_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private Member member;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "post_id")
    @OnDelete(action = OnDeleteAction.CASCADE) private FeedPost post;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "promotion_id")
    @OnDelete(action = OnDeleteAction.CASCADE) private Promotion news;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "comment_id")
    @OnDelete(action = OnDeleteAction.CASCADE) private FeedComment comment;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    public static ContentLike create(Member member, FeedPost post, Promotion news, LocalDateTime now) {
        if ((post == null) == (news == null)) throw new IllegalArgumentException("Exactly one like target is required");
        ContentLike item = new ContentLike(); item.member = member; item.post = post; item.news = news; item.createdAt = now; return item;
    }
    public static ContentLike comment(Member member, FeedComment comment, LocalDateTime now) {
        if (comment == null) throw new IllegalArgumentException("A comment like target is required");
        ContentLike item = new ContentLike(); item.member = member; item.comment = comment; item.createdAt = now; return item;
    }
}
