package kr.it.reserve.promotion;

import jakarta.persistence.criteria.JoinType;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import org.springframework.data.jpa.domain.Specification;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/** 소식 공개 조건과 페이지 total의 조건을 함께 적용한다. 기간 표시는 UTC 원문을 기준으로 한다. */
public final class StoreNewsPolicy {
    private StoreNewsPolicy() {}
    public static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    public static boolean active(Member member) {
        return member != null && !member.isDeleted() && !member.isSuspended() && member.isTermsAgreed();
    }
    public static boolean usable(Store store) {
        return store != null && !store.isDeleted() && !store.isSuspended() && active(store.getOwner());
    }
    public static boolean newsWriter(Member member) {
        return active(member) && (member.getRole() == Role.BUSINESS || member.getRole() == Role.ADMIN);
    }
    public static boolean deleted(Promotion news) {
        return news == null || news.getState() == Promotion.State.DELETED || news.getDeletedAt() != null
                || news.getNewsPost() != null && news.getNewsPost().isDeleted();
    }
    public static boolean publicNews(Promotion news) {
        return news != null && news.getState() == Promotion.State.PUBLISHED && news.getDeletedAt() == null
                && usable(news.getStore()) && newsWriter(news.getMember())
                && Objects.equals(news.getMember().getId(), news.getStore().getOwner().getId())
                && (news.getNewsPost() == null || news.getNewsPost().isPublished());
    }
    public static String period(Promotion news, LocalDateTime now) {
        if (news.getEndsAt() != null && !now.isBefore(news.getEndsAt())) return "ENDED";
        if (news.getStartsAt() != null && now.isBefore(news.getStartsAt())) return "UPCOMING";
        return news.getStartsAt() != null || news.getEndsAt() != null ? "ONGOING" : null;
    }
    public static boolean publicBenefit(Promotion news) {
        return publicNews(news) && news.getBenefitState() == Promotion.BenefitState.APPROVED;
    }
    public static boolean publicFeedNews(Promotion news) {
        return false;
    }
    public static boolean publiclyVisible(Promotion news) {
        return publicBenefit(news);
    }
    public static OffsetDateTime offset(LocalDateTime time) { return time == null ? null : time.atOffset(ZoneOffset.UTC); }
    public static Specification<Promotion> applicationSpecification(Promotion.BenefitState state) {
        return (root, query, cb) -> {
            var post = root.join("newsPost", JoinType.LEFT);
            var requested = state == null
                    ? root.get("benefitState").in(Promotion.BenefitState.PENDING, Promotion.BenefitState.APPROVED, Promotion.BenefitState.REJECTED)
                    : cb.equal(root.get("benefitState"), state);
            return cb.and(requested, cb.notEqual(root.get("state"), Promotion.State.DELETED), cb.isNull(root.get("deletedAt")),
                    cb.or(cb.isNull(post.get("id")), cb.notEqual(post.get("state").as(String.class), "DELETED")), cb.isNull(post.get("deletedAt")));
        };
    }
    public static Specification<Promotion> publicSpecification(Long storeId, Promotion.NewsType type, boolean ongoing) {
        return visibilitySpecification(storeId, type, ongoing);
    }
    public static Specification<Promotion> publicDetailSpecification(Long id) {
        return visibilitySpecification(null, null, false).and((root, query, cb) -> cb.equal(root.get("id"), id));
    }
    private static Specification<Promotion> visibilitySpecification(Long storeId, Promotion.NewsType type, boolean ongoing) {
        LocalDateTime utc = now(); LocalDateTime sanctions = LocalDateTime.now(Clock.systemDefaultZone());
        return (root, query, cb) -> {
            var store = root.join("store"); var owner = store.join("owner"); var member = root.join("member");
            var post = root.join("newsPost", JoinType.LEFT);
            var approved = cb.equal(root.get("benefitState"), Promotion.BenefitState.APPROVED);
            var exposure = approved;
            var predicate = cb.and(cb.equal(root.get("state"), Promotion.State.PUBLISHED), cb.isNull(root.get("deletedAt")), exposure,
                    cb.isNull(store.get("deletedAt")), cb.isNull(owner.get("deletedAt")), cb.isTrue(owner.get("termsAgreed")),
                    cb.isNull(member.get("deletedAt")), cb.isTrue(member.get("termsAgreed")),
                    member.get("role").in(Role.BUSINESS, Role.ADMIN),
                    cb.equal(owner.get("id"), member.get("id")),
                    cb.or(cb.equal(store.get("status"), StoreStatus.ACTIVE), cb.and(cb.equal(store.get("status"), StoreStatus.SUSPENDED), cb.lessThan(store.get("suspendedUntil"), sanctions))),
                    cb.or(cb.equal(member.get("status"), MemberStatus.ACTIVE), cb.and(cb.equal(member.get("status"), MemberStatus.SUSPENDED), cb.lessThan(member.get("suspendedUntil"), sanctions))),
                    cb.or(cb.isNull(post.get("id")), cb.equal(post.get("state").as(String.class), "PUBLISHED")));
            if (storeId != null) predicate = cb.and(predicate, cb.equal(store.get("id"), storeId));
            if (type != null) predicate = cb.and(predicate, cb.equal(root.get("newsType"), type));
            if (ongoing) predicate = cb.and(predicate,
                    cb.or(cb.isNull(root.get("startsAt")), cb.lessThanOrEqualTo(root.get("startsAt"), utc)),
                    cb.or(cb.isNull(root.get("endsAt")), cb.greaterThan(root.get("endsAt"), utc)));
            return predicate;
        };
    }
}
