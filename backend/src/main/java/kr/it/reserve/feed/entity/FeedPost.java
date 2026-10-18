package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.promotion.entity.Promotion;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity
@Table(name = "feed_post", uniqueConstraints = @UniqueConstraint(name = "uk_feed_post_request", columnNames = {"profile_id", "client_request_id"}), indexes = {
    @Index(name = "ix_feed_post_public", columnList = "state,created_at,post_id"),
    @Index(name = "ix_feed_post_region", columnList = "region,state,created_at,post_id"),
    @Index(name = "ix_feed_post_author", columnList = "profile_id,state,created_at,post_id"),
    @Index(name = "ix_feed_post_deleted", columnList = "state,deleted_at,post_id")
})
@Getter @NoArgsConstructor
public class FeedPost implements kr.it.reserve.promotion.entity.NewsPublication {
    public enum State { DRAFT, PUBLISHED, HIDDEN, DELETED }
    public boolean isPublished() { return state == State.PUBLISHED; }
    public boolean isDeleted() { return state == State.DELETED; }
    public static FeedPost linkedTo(Promotion news) {
        if (news.getNewsPost() == null) return null;
        if (news.getNewsPost() instanceof FeedPost post) return post;
        throw new IllegalStateException("Unsupported news publication entity mapping");
    }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "post_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "profile_id", nullable = false) private FeedProfile profile;
    @Column(nullable = false, columnDefinition = "TEXT") private String content;
    @Column(length = 50) private String region;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "store_id") @OnDelete(action = OnDeleteAction.SET_NULL) private Store store;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "promotion_id") @OnDelete(action = OnDeleteAction.SET_NULL) private Promotion promotion;
    // 소식의 원문은 Promotion 한 곳에만 있다. 이 행은 사진·신고와 피드 노출을 연결한다.
    @OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "news_promotion_id", unique = true) private Promotion newsPromotion;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR) @Column(nullable = false, length = 16) private State state;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "client_request_id", length = 36, updatable = false) private String clientRequestId;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    @Column(name = "deleted_at") private LocalDateTime deletedAt;
    public static FeedPost create(FeedProfile profile, String clientRequestId, LocalDateTime now) {
        FeedPost post = new FeedPost(); post.profile = profile; post.clientRequestId = clientRequestId; post.createdAt = now; return post;
    }
    public void edit(String text, String region, Store store, Promotion promotion, boolean draft, LocalDateTime now) {
        if (state == State.DRAFT && !draft) createdAt = now;
        content = text; this.region = region; this.store = store; this.promotion = promotion;
        state = draft ? State.DRAFT : State.PUBLISHED; updatedAt = now;
    }
    public void touch(LocalDateTime now) { updatedAt = now; }
    public void linkNews(Promotion source, String region, LocalDateTime now) {
        newsPromotion = source;
        edit("", region, source.getStore(), null, source.getState() == Promotion.State.DRAFT, now);
        source.setNewsPost(this);
    }
    public void setVisibility(boolean hidden, LocalDateTime now) { state = hidden ? State.HIDDEN : State.PUBLISHED; updatedAt = now; }
    public void delete(LocalDateTime now) { state = State.DELETED; deletedAt = now; updatedAt = now; }
}
