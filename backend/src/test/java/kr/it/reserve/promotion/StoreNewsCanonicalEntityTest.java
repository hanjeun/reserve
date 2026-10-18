package kr.it.reserve.promotion;

import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class StoreNewsCanonicalEntityTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");

    @Test
    void legacyNewsKeepsItsPublishedAddressWithoutAutomaticFeedExposure() {
        Promotion news = news();

        assertThat(news.getNewsType()).isEqualTo(Promotion.NewsType.NEWS);
        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        assertThat(news.isFeedEnabled()).isFalse();
        assertThat(news.getNewsPost()).isNull();
    }

    @Test
    void feedCarrierReferencesCanonicalNewsWithoutCopyingOriginalContent() {
        Promotion news = news();
        FeedPost carrier = link(news);

        news.editNews("새 제목", "수정한 정본", Promotion.NewsType.EVENT,
                NOW, NOW.plusDays(7), "현장 이용", true, false);

        assertThat(carrier.getNewsPromotion()).isSameAs(news);
        assertThat(news.getNewsPost()).isSameAs(carrier);
        assertThat(carrier.getContent()).isEmpty();
        assertThat(carrier.getNewsPromotion().getContent()).isEqualTo("수정한 정본");
        assertThat(carrier.getStore()).isSameAs(news.getStore());
        assertThat(carrier.getPromotion()).isNull();
    }

    @Test
    void hidingCanonicalNewsImmediatelyHidesBothSurfacesWithoutDestroyingOriginal() {
        Promotion news = news();
        FeedPost carrier = link(news);

        news.hideNews(true, NOW.plusHours(1));

        assertThat(news.getState()).isEqualTo(Promotion.State.HIDDEN);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.HIDDEN);
        assertThat(news.getContent()).isEqualTo("보존할 원문");
        assertThat(news.getDeletedAt()).isNull();

        news.hideNews(false, NOW.plusHours(2));
        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.PUBLISHED);
    }

    @Test
    void deletingNewsPreservesOriginalAndDoesNotRestartEitherThirtyDayGrace() {
        Promotion news = news();
        FeedPost carrier = link(news);
        LocalDateTime deleted = NOW.plusHours(1);

        news.deleteNews(deleted);
        news.deleteNews(deleted.plusDays(29));

        assertThat(news.getState()).isEqualTo(Promotion.State.DELETED);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.DELETED);
        assertThat(news.getDeletedAt()).isEqualTo(deleted);
        assertThat(carrier.getDeletedAt()).isEqualTo(deleted);
        assertThat(news.getContent()).isEqualTo("보존할 원문");
        assertThat(carrier.getNewsPromotion()).isSameAs(news);
    }

    private Promotion news() {
        Member owner = Member.builder().id(7L).role(Role.BUSINESS).build();
        Store store = Store.builder().id(3L).name("가게").owner(owner).build();
        return Promotion.builder().id(11L).member(owner).store(store).title("소식")
                .content("보존할 원문").category(Promotion.PromotionCategory.CAFE).build();
    }

    private FeedPost link(Promotion news) {
        FeedProfile profile = FeedProfile.create(news.getMember(), NOW);
        FeedPost carrier = FeedPost.create(profile, "d4887b47-ef27-4a25-9488-49a76a4b4532", NOW);
        carrier.linkNews(news, "서울", NOW);
        return carrier;
    }
}
