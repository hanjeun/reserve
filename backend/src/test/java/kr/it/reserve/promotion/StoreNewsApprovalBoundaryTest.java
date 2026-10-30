package kr.it.reserve.promotion;

import jakarta.persistence.EntityManager;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.entity.FeedMedia;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.repository.FeedAuditRepository;
import kr.it.reserve.feed.repository.FeedMediaRepository;
import kr.it.reserve.feed.repository.FeedPostRepository;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StoreNewsApprovalBoundaryTest {
    @Mock StoreNewsAvailability policy;
    @Mock FeedService feeds;
    @Mock PromotionRepository promotions;
    @Mock FeedPostRepository posts;
    @Mock FeedMediaRepository media;
    @Mock MemberRepository members;
    @Mock StoreRepository stores;
    @Mock EntityManager entityManager;
    @Mock FeedAuditRepository audits;
    @InjectMocks StoreNewsService service;
    private Member owner;
    private Store store;
    private FeedProfile profile;
    private Promotion news;
    private FeedPost post;

    @BeforeEach
    void setUp() {
        LocalDateTime now = LocalDateTime.parse("2026-10-12T04:00:00");
        owner = Member.builder().id(7L).role(Role.BUSINESS).termsAgreed(true).build();
        store = Store.builder().id(3L).owner(owner).name("가게").address("서울 강남구").build();
        profile = FeedProfile.create(owner, now);
        news = Promotion.builder().id(11L).member(owner).store(store).title("제목").content("본문").conditions("")
                .category(Promotion.PromotionCategory.CAFE).feedEnabled(true).createdAt(now).updatedAt(now).build();
        post = FeedPost.create(profile, null, now); ReflectionTestUtils.setField(post, "id", 20L);
        post.linkNews(news, "서울", now);
    }

    @Test
    void legacyFeedOptInCannotGrantBenefitPublication() {
        editing();
        var result = service.edit(7L, 11L, request("제목", false, true, List.of()));
        assertThat(result.benefitState()).isEqualTo("NONE");
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        assertThat(result.feedEnabled()).isFalse();
        assertThat(result.feedPostId()).isNull();
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        verifyNoInteractions(audits);
    }

    @Test
    void submittedBenefitStaysPrivateUntilApproval() {
        editing(); photos();
        var result = service.edit(7L, 11L, request("제목", true, true, List.of(41L)));
        assertThat(result.benefitState()).isEqualTo("PENDING");
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        verify(audits).save(argThat(record -> record.getAction().equals("BENEFIT_SUBMITTED")));
    }

    @Test
    void applicationWithoutPhotoFailsWithoutChangingApprovalOrContent() {
        editing(); news.setBenefitState(Promotion.BenefitState.APPROVED);
        assertStatus(() -> service.edit(7L, 11L, request("수정", true, true, List.of())), HttpStatus.BAD_REQUEST);
        assertThat(news.getTitle()).isEqualTo("제목");
        assertThat(news.getBenefitState()).isEqualTo(Promotion.BenefitState.APPROVED);
        verify(feeds, never()).applyMedia(any(), anyList(), anyLong());
        verifyNoInteractions(audits);
    }

    @Test
    void approvedContentEditRequeuesBenefitWithoutPublishingInFeed() {
        editing(); photos(); news.setBenefitState(Promotion.BenefitState.APPROVED);
        service.edit(7L, 11L, request("수정", true, true, List.of(41L)));
        assertThat(news.getBenefitState()).isEqualTo(Promotion.BenefitState.PENDING);
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        verify(audits).save(argThat(record -> record.getAction().equals("BENEFIT_EDIT_REVIEW")));
    }

    @Test
    void legacyFeedVisibilityFlagCannotChangeApprovedBenefit() {
        editing(); photos(); news.setBenefitState(Promotion.BenefitState.APPROVED);
        service.edit(7L, 11L, request("제목", true, false, List.of(41L)));
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        assertThat(StoreNewsPolicy.publicBenefit(news)).isTrue();
        assertThat(StoreNewsPolicy.publiclyVisible(news)).isTrue();
        verifyNoInteractions(audits);
    }

    @Test
    void staleAdminReviewDoesNotApproveChangedContent() {
        reviewing(); news.setBenefitState(Promotion.BenefitState.PENDING);
        assertStatus(() -> service.reviewBenefit(1L, 11L, new StoreNewsDto.BenefitReview(3L, true, "확인")), HttpStatus.CONFLICT);
        assertThat(news.getBenefitState()).isEqualTo(Promotion.BenefitState.PENDING);
        verify(feeds).requireAdmin(1L); verifyNoInteractions(audits, media);
    }

    @Test
    void rejectionRecordsReasonAndKeepsBenefitPrivate() {
        reviewing(); photos(); news.setBenefitState(Promotion.BenefitState.PENDING);
        var result = service.reviewBenefit(1L, 11L, new StoreNewsDto.BenefitReview(0L, false, "조건을 보완해주세요."));
        assertThat(result.benefitState()).isEqualTo("REJECTED");
        assertThat(result.benefitReviewNote()).isEqualTo("조건을 보완해주세요.");
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        verify(audits).save(argThat(record -> record.getActorId().equals(1L) && record.getAction().equals("BENEFIT_REJECTED")));
    }

    @Test
    void revokedBusinessPermissionCannotBeApprovedOrStayPublic() {
        owner.setRole(Role.USER);
        news.setBenefitState(Promotion.BenefitState.PENDING);
        when(promotions.findById(11L)).thenReturn(Optional.of(news));
        when(feeds.activeWriter(7L)).thenReturn(owner);
        assertStatus(() -> service.reviewBenefit(1L, 11L, new StoreNewsDto.BenefitReview(0L, true, "확인")), HttpStatus.FORBIDDEN);
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        verifyNoInteractions(stores, media, audits);
    }

    @Test
    void nonAdminCannotReviewAnApplication() {
        doThrow(new FeedException("접근 권한이 없어요.", HttpStatus.FORBIDDEN)).when(feeds).requireAdmin(7L);
        assertStatus(() -> service.reviewBenefit(7L, 11L, new StoreNewsDto.BenefitReview(0L, true, "확인")), HttpStatus.FORBIDDEN);
        verifyNoInteractions(promotions, media, audits, entityManager);
    }

    @Test
    void approvedPhotoReplacementRequiresNewReviewEvenWithSameText() {
        editing(); photos(); news.setBenefitState(Promotion.BenefitState.APPROVED);
        service.edit(7L, 11L, request("제목", true, true, List.of(42L)));
        assertThat(news.getBenefitState()).isEqualTo(Promotion.BenefitState.PENDING);
        assertThat(StoreNewsPolicy.publicBenefit(news)).isFalse();
        assertThat(StoreNewsPolicy.publicFeedNews(news)).isFalse();
    }

    @Test
    void sameApplicationCannotBeApprovedTwice() {
        reviewing(); photos(); news.setBenefitState(Promotion.BenefitState.PENDING);
        var request = new StoreNewsDto.BenefitReview(0L, true, "사진과 조건 확인");
        service.reviewBenefit(1L, 11L, request);
        assertStatus(() -> service.reviewBenefit(1L, 11L, request), HttpStatus.CONFLICT);
        assertThat(StoreNewsPolicy.publicBenefit(news)).isTrue();
        verify(audits, times(1)).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = Promotion.State.class, names = {"HIDDEN", "DELETED"})
    void moderationHideOrDeletionCannotBeUndoneByBenefitApproval(Promotion.State state) {
        reviewing(); news.setBenefitState(Promotion.BenefitState.PENDING); news.setState(state);
        assertStatus(() -> service.reviewBenefit(1L, 11L, new StoreNewsDto.BenefitReview(0L, true, "확인")), HttpStatus.CONFLICT);
        assertThat(news.getState()).isEqualTo(state); verifyNoInteractions(audits);
    }

    private void editing() { reviewing(); when(feeds.mediaProfile(owner)).thenReturn(profile); }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"news", "post", "timestamp"})
    void deletedApplicationsCannotBeReadDirectly(String deleted) {
        news.setBenefitState(Promotion.BenefitState.PENDING);
        if (deleted.equals("news")) news.deleteNews(StoreNewsPolicy.now());
        else if (deleted.equals("post")) post.delete(StoreNewsPolicy.now());
        else news.setDeletedAt(StoreNewsPolicy.now());
        when(promotions.findForRead(11L)).thenReturn(Optional.of(news));
        assertStatus(() -> service.application(1L, 11L), HttpStatus.NOT_FOUND);
        verifyNoInteractions(audits, media);
    }
    private void reviewing() {
        when(feeds.activeWriter(7L)).thenReturn(owner);
        when(promotions.findById(11L)).thenReturn(Optional.of(news));
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
    }
    private void photos() {
        FeedMedia image = mock(FeedMedia.class); when(image.getId()).thenReturn(41L);
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of(image));
    }
    private StoreNewsDto.Request request(String title, boolean benefit, boolean feed, List<Long> ids) {
        return new StoreNewsDto.Request(3L, title, "본문", "NEWS", null, null, "", feed, ids, false, 0L, null, benefit);
    }
    private void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }
}
