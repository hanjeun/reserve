package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity @Getter @NoArgsConstructor
@Table(name = "feed_comment", uniqueConstraints = @UniqueConstraint(name = "uk_feed_comment_request", columnNames = {"profile_id", "client_request_id"}), indexes = {
    @Index(name = "ix_feed_comment_post", columnList = "post_id,parent_id,created_at,comment_id"),
    @Index(name = "ix_feed_comment_profile", columnList = "profile_id,state,comment_id"),
    @Index(name = "ix_feed_comment_retention", columnList = "state,deleted_at,comment_id")
})
public class FeedComment {
    public enum State { PUBLISHED, HIDDEN, DELETED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "comment_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "post_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private FeedPost post;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "profile_id")
    @OnDelete(action = OnDeleteAction.SET_NULL) private FeedProfile profile;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "parent_id") @OnDelete(action = OnDeleteAction.SET_NULL) private FeedComment parent;
    @Column(nullable = false, columnDefinition = "TEXT") private String content;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR) @Column(nullable = false, length = 16) private State state;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "client_request_id", length = 36, updatable = false) private String clientRequestId;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    @Column(name = "deleted_at") private LocalDateTime deletedAt;
    public static FeedComment create(FeedPost post, FeedProfile author, FeedComment parent, String text, String requestId, LocalDateTime now) {
        FeedComment item = new FeedComment(); item.post = post; item.profile = author; item.parent = parent; item.content = text;
        item.clientRequestId = requestId; item.state = State.PUBLISHED; item.createdAt = now; item.updatedAt = now; return item;
    }
    public void edit(String text, LocalDateTime now) { content = text; updatedAt = now; }
    public void delete(LocalDateTime now) { state = State.DELETED; deletedAt = now; updatedAt = now; }
    public void visibility(boolean hidden, LocalDateTime now) { state = hidden ? State.HIDDEN : State.PUBLISHED; updatedAt = now; }
    public void eraseOriginal(LocalDateTime now) { content = ""; deletedAt = null; updatedAt = now; }
}
