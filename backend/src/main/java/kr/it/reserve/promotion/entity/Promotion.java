package kr.it.reserve.promotion.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.store.entity.Store;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "promotion", indexes = {
    @Index(name = "ix_promotion_news_public", columnList = "state,news_type,ends_at,created_at,promotion_id"),
    @Index(name = "ix_promotion_news_author", columnList = "member_id,state,created_at,promotion_id"),
    @Index(name = "ix_promotion_news_deleted", columnList = "state,deleted_at,promotion_id"),
    @Index(name = "ix_promotion_benefit_review", columnList = "benefit_state,benefit_requested_at,promotion_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@DynamicUpdate
public class Promotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "promotion_id")
    private Long id;

    // 홍보를 작성한 회원 (사업자 또는 관리자)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    // 홍보할 가게
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PromotionCategory category;

    @Column(length = 500)
    private String imageUrl;

    // 특색 메뉴
    @Column(length = 500)
    private String specialMenu;

    // 가게 역사/스토리
    @Column(columnDefinition = "TEXT")
    private String storyHistory;

    @Column(length = 500)
    private String tags;

    // 업종 category와 소식 종류는 별개다. 기존 소식과 주소는 NEWS/PUBLISHED로 유지한다.
    public enum NewsType { NEWS, NOTICE, EVENT, BENEFIT }
    public enum BenefitDesign { STANDARD, PHOTO, COMPACT }
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "benefit_design", nullable = false, length = 16)
    @Builder.Default private BenefitDesign design = BenefitDesign.STANDARD;
    public enum State { DRAFT, PUBLISHED, HIDDEN, DELETED }
    // 혜택 탭 심사와 피드의 게시/숨김 상태는 독립이다. 기존 행을 자동 승인하지 않는다.
    public enum BenefitState { NONE, DRAFT, PENDING, APPROVED, REJECTED }
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "benefit_state", nullable = false, length = 16)
    @Builder.Default private BenefitState benefitState = BenefitState.NONE;
    @Column(name = "benefit_requested_at") private LocalDateTime benefitRequestedAt;
    @Column(name = "benefit_reviewed_at") private LocalDateTime benefitReviewedAt;
    @Column(name = "benefit_reviewer_id") private Long benefitReviewerId;
    @Column(name = "benefit_review_note", length = 1000) private String benefitReviewNote;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "news_type", nullable = false, length = 16)
    @Builder.Default private NewsType newsType = NewsType.NEWS;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    @Builder.Default private State state = State.PUBLISHED;
    @Column(name = "starts_at") private LocalDateTime startsAt;
    @Column(name = "ends_at") private LocalDateTime endsAt;
    @Column(length = 1000) private String conditions;
    @Column(name = "feed_enabled", nullable = false)
    @Builder.Default private boolean feedEnabled = false;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "deleted_at") private LocalDateTime deletedAt;
    @OneToOne(mappedBy = "newsPromotion", fetch = FetchType.LAZY)
    private NewsPublication newsPost;

    @Column(nullable = false)
    @Builder.Default
    private Integer viewCount = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer likeCount = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // 행사 기간·30일 파기·새 응답은 UTC를 사용한다. 기존 저장 시각은 일괄 변환하지 않는다.
    @PrePersist
    private void createTimestamps() {
        LocalDateTime now = StoreNewsPolicy.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }
    @PreUpdate
    private void updateTimestamp() { updatedAt = StoreNewsPolicy.now(); }

    public enum PromotionCategory {
        RESTAURANT("음식점"),
        CAFE("카페"),
        BEAUTY("뷰티/미용"),
        ACTIVITY("액티비티"),
        ETC("기타");

        private final String displayName;

        PromotionCategory(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    public void increaseViewCount() {
        this.viewCount++;
    }

    public void increaseLikeCount() {
        this.likeCount++;
    }

    public void decreaseLikeCount() {
        if (this.likeCount > 0) {
            this.likeCount--;
        }
    }

    public void editNews(String title, String content, NewsType type, LocalDateTime startsAt,
                         LocalDateTime endsAt, String conditions, boolean feedEnabled, boolean draft) {
        this.title = title; this.content = content; this.newsType = type;
        this.startsAt = startsAt; this.endsAt = endsAt; this.conditions = conditions;
        this.feedEnabled = feedEnabled; this.state = draft ? State.DRAFT : State.PUBLISHED;
    }

    public void withdrawBenefit() {
        benefitState = BenefitState.NONE; benefitRequestedAt = null;
        benefitReviewedAt = null; benefitReviewerId = null; benefitReviewNote = null;
    }

    public void requestBenefit(boolean draft, LocalDateTime now) {
        benefitState = draft ? BenefitState.DRAFT : BenefitState.PENDING;
        benefitRequestedAt = draft ? null : now;
        benefitReviewedAt = null; benefitReviewerId = null; benefitReviewNote = null;
    }

    public void reviewBenefit(boolean approved, Long reviewer, String note, LocalDateTime now) {
        benefitState = approved ? BenefitState.APPROVED : BenefitState.REJECTED;
        benefitReviewedAt = now; benefitReviewerId = reviewer; benefitReviewNote = note;
    }

    public void deleteNews(LocalDateTime now) {
        if (state != State.DELETED) { state = State.DELETED; deletedAt = now; }
        if (newsPost != null && !newsPost.isDeleted()) newsPost.delete(now);
    }

    public void hideNews(boolean hidden, LocalDateTime now) {
        state = hidden ? State.HIDDEN : State.PUBLISHED;
        if (newsPost != null) newsPost.setVisibility(hidden, now);
    }
}
