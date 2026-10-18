package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Check;
import java.time.LocalDateTime;

@Entity
@Table(name = "feed_media", indexes = {
    @Index(name = "ix_feed_media_post", columnList = "post_id,position,media_id"),
    @Index(name = "ix_feed_media_comment", columnList = "comment_id,position,media_id"),
    @Index(name = "ix_feed_media_key", columnList = "image_key"),
    @Index(name = "ix_feed_media_orphan", columnList = "post_id,created_at,media_id")
})
@Getter @NoArgsConstructor
@Check(name = "ck_feed_media_parent", constraints = "NOT (post_id IS NOT NULL AND comment_id IS NOT NULL) AND NOT (original_post_id IS NOT NULL AND original_comment_id IS NOT NULL)")
public class FeedMedia {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "media_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "member_id", nullable = false) private Member member;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "post_id") private FeedPost post;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "comment_id") private FeedComment comment;
    @Column(name = "original_post_id") private Long originalPostId;
    @Column(name = "original_comment_id") private Long originalCommentId;
    @Column(name = "image_key", nullable = false, length = 700, updatable = false) private String imageKey;
    @Column(name = "content_type", nullable = false, length = 40, updatable = false) private String contentType;
    @Column(nullable = false, updatable = false) private int width;
    @Column(nullable = false, updatable = false) private int height;
    @Column(name = "byte_count", nullable = false, updatable = false) private long byteCount;
    @Column(nullable = false) private int position;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "detached_at") private LocalDateTime detachedAt;
    public static FeedMedia create(Member member, String key, String type, int width, int height, long bytes, LocalDateTime now) {
        FeedMedia media = new FeedMedia(); media.member = member; media.imageKey = key; media.contentType = type;
        media.width = width; media.height = height; media.byteCount = bytes; media.createdAt = now; return media;
    }
    public void attach(FeedPost post, int position) {
        if (comment != null || originalCommentId != null) throw new IllegalStateException("Comment media cannot become post media");
        if (originalPostId == null) originalPostId = post.getId();
        this.post = post; this.position = position; detachedAt = null;
    }
    public void attachComment(FeedComment comment, int position) {
        if (post != null || originalPostId != null) throw new IllegalStateException("Post media cannot become comment media");
        if (originalCommentId == null) originalCommentId = comment.getId();
        this.comment = comment; this.position = position; detachedAt = null;
    }
    public void detach(LocalDateTime now) { post = null; comment = null; detachedAt = now; }
}
