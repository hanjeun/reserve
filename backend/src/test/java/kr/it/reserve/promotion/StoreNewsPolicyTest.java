package kr.it.reserve.promotion;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class StoreNewsPolicyTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");

    @Test
    void upcomingOngoingAndEndedUseExactUtcBoundariesWithoutRemovingTheNews() {
        Promotion news = news();
        news.setStartsAt(NOW.plusMinutes(1));
        news.setEndsAt(NOW.plusDays(7));

        assertThat(StoreNewsPolicy.period(news, NOW)).isEqualTo("UPCOMING");
        assertThat(StoreNewsPolicy.period(news, news.getStartsAt())).isEqualTo("ONGOING");
        assertThat(StoreNewsPolicy.period(news, news.getEndsAt())).isEqualTo("ENDED");
        assertThat(StoreNewsPolicy.offset(news.getEndsAt()).getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(StoreNewsPolicy.publicNews(news)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = Promotion.State.class, names = {"DRAFT", "HIDDEN", "DELETED"})
    void unpublishedOriginalCannotBeReadThroughAnotherPublicSurface(Promotion.State state) {
        Promotion news = news();
        news.setState(state);

        assertThat(StoreNewsPolicy.publicNews(news)).isFalse();
    }

    @Test
    void ownershipTransferDoesNotExposeFormerOwnersCanonicalNews() {
        Promotion news = news();
        news.getStore().setOwner(Member.builder().id(9L).role(Role.BUSINESS).termsAgreed(true).build());

        assertThat(StoreNewsPolicy.publicNews(news)).isFalse();
    }

    @Test
    void withdrawnOrBannedAuthorAndClosedStoreFailClosed() {
        Promotion withdrawn = news();
        withdrawn.getMember().softDelete();
        Promotion banned = news();
        banned.getMember().setStatus(MemberStatus.BANNED);
        Promotion closed = news();
        closed.getStore().softDelete();

        assertThat(StoreNewsPolicy.publicNews(withdrawn)).isFalse();
        assertThat(StoreNewsPolicy.publicNews(banned)).isFalse();
        assertThat(StoreNewsPolicy.publicNews(closed)).isFalse();
    }

    @Test
    void originalLegacyNewsRemainsPublicWithoutFeedOptInOrAFeedProfile() {
        Promotion news = news();

        assertThat(news.isFeedEnabled()).isFalse();
        assertThat(news.getNewsPost()).isNull();
        assertThat(StoreNewsPolicy.publicNews(news)).isTrue();
        assertThat(StoreNewsPolicy.period(news, NOW)).isNull();
    }

    @Test
    void approvedBenefitRemainsIndependentOfHiddenOrUnconfiguredFeedProfile() {
        Promotion news = news(); news.setBenefitState(Promotion.BenefitState.APPROVED);
        FeedProfile internal = FeedProfile.mediaOwner(news.getMember(), NOW);
        FeedPost carrier = FeedPost.create(internal, null, NOW); carrier.linkNews(news, "서울", NOW);

        assertThat(StoreNewsPolicy.publicBenefit(news)).isTrue();
        internal.withdraw(NOW);
        assertThat(StoreNewsPolicy.publicBenefit(news)).isTrue();
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = FeedPost.State.class, names = {"DRAFT", "HIDDEN", "DELETED"})
    void inconsistentCarrierStateCannotExposeItsOriginalFromBenefits(FeedPost.State state) {
        Promotion news = news();
        FeedPost carrier = FeedPost.create(FeedProfile.create(news.getMember(), NOW), null, NOW);
        carrier.linkNews(news, "서울", NOW);
        if (state == FeedPost.State.DRAFT) carrier.edit("", "서울", news.getStore(), null, true, NOW);
        else if (state == FeedPost.State.HIDDEN) carrier.setVisibility(true, NOW);
        else carrier.delete(NOW);

        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        assertThat(StoreNewsPolicy.publicNews(news)).isFalse();
    }

    private Promotion news() {
        Member owner = Member.builder().id(7L).role(Role.BUSINESS).termsAgreed(true).build();
        Store store = Store.builder().id(3L).name("가게").owner(owner).build();
        return Promotion.builder().id(11L).member(owner).store(store).title("소식")
                .content("원문").category(Promotion.PromotionCategory.CAFE).build();
    }
}
