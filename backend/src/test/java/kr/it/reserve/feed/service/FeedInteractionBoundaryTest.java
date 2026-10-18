package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedInteractionDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedInteractionBoundaryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-12T10:00:00");
    private static final String REQUEST = "6191717d-6bf6-42e0-9495-b44311c9eed8";
    @Mock FeedService feeds;
    @Mock StoreNewsService newsService;
    @Mock FeedPostRepository posts;
    @Mock PromotionRepository promotions;
    @Mock ContentLikeRepository likes;
    @Mock FeedCommentRepository comments;
    @Mock FeedCommentReportRepository reports;
    @Mock FeedAuditRepository audits;
    @Mock ObjectMapper mapper;
    @Mock EntityManager entityManager;
    @Mock FeedMediaRepository media;
    @Mock FeedCommentReportImageRepository evidence;
    @Mock FeedNotificationService notifications;
    @Mock FeedProfileRepository profiles;
    @Mock FeedCommentService publicComments;
    private FeedInteractionPolicy policy() {
        var policy = new FeedInteractionPolicy(new FeedPolicy(true), new StoreNewsAvailability(true)); ReflectionTestUtils.setField(policy, "enabled", true); return policy;
    }
    private ContentLikeService likeService() { return new ContentLikeService(policy(), feeds, newsService, posts, promotions, likes, comments, publicComments, notifications, profiles, entityManager); }
    private FeedCommentService commentService() { return new FeedCommentService(policy(), feeds, posts, comments, reports, audits, mapper, entityManager, media, likes, evidence, notifications); }
    private FeedProfile profile(Long id) {
        var member = Member.builder().id(id).role(Role.USER).status(MemberStatus.ACTIVE).termsAgreed(true).build();
        var profile = FeedProfile.create(member, NOW); profile.update("공개 닉네임", "public:" + id, "", false, NOW); return profile;
    }
    private FeedPost post(Long id, FeedProfile profile) {
        var post = FeedPost.create(profile, REQUEST, NOW); post.edit("본문", "서울", null, null, false, NOW);
        ReflectionTestUtils.setField(post, "id", id); return post;
    }
    private FeedComment comment(Long id, FeedPost post, FeedProfile profile, FeedComment parent) {
        var item = FeedComment.create(post, profile, parent, "원래 댓글", REQUEST, NOW); ReflectionTestUtils.setField(item, "id", id); return item;
    }
    private void writer(FeedProfile profile) {
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember()); when(feeds.writableProfile(1L)).thenReturn(profile);
    }

    @Test void replayingTheDesiredLikeStateDoesNotToggleOrCreateAnotherRow() {
        var profile = profile(1L); var post = post(10L, profile); var saved = ContentLike.create(profile.getMember(), post, null, NOW);
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember()); when(posts.findForUpdate(10L)).thenReturn(Optional.of(post));
        when(feeds.isPublic(post)).thenReturn(true); when(likes.findByMember_IdAndPost_Id(1L, 10L)).thenReturn(Optional.of(saved));
        when(likes.countByPost_Id(10L)).thenReturn(1L);
        assertThat(likeService().set(1L, "POST", 10L, true).liked()).isTrue();
        verify(likes, never()).saveAndFlush(any()); verify(likes, never()).delete(any());
    }
    @Test void hiddenPostsCannotReceiveNewLikes() {
        var profile = profile(1L); var post = post(10L, profile);
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember()); when(posts.findForUpdate(10L)).thenReturn(Optional.of(post));
        assertThatThrownBy(() -> likeService().set(1L, "POST", 10L, true)).isInstanceOf(FeedException.class);
        verify(likes, never()).saveAndFlush(any());
    }
    @Test void newsCarrierCannotBeLikedThroughThePostEndpoint() {
        var profile = profile(1L);
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember()); when(posts.newsSourceId(10L)).thenReturn(Optional.of(20L));
        assertThatThrownBy(() -> likeService().set(1L, "POST", 10L, true)).isInstanceOf(FeedException.class);
        verifyNoInteractions(promotions, likes, comments);
    }
    @Test void approvedBenefitLikeUsesOnlyTheNewsTargetWithFeedDisabled() {
        var profile = profile(1L); var news = mock(Promotion.class); when(news.getId()).thenReturn(20L);
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember());
        when(promotions.findForUpdate(20L)).thenReturn(Optional.of(news));
        when(likes.findByMember_IdAndNews_Id(1L, 20L)).thenReturn(Optional.of(ContentLike.create(profile.getMember(), null, news, NOW)));
        when(likes.countByNews_Id(20L)).thenReturn(1L);
        try (var visibility = mockStatic(StoreNewsPolicy.class)) {
            visibility.when(() -> StoreNewsPolicy.publicBenefit(news)).thenReturn(true);
            var independent = new FeedInteractionPolicy(new FeedPolicy(false), new StoreNewsAvailability(true));
            ReflectionTestUtils.setField(independent, "enabled", true);
            var status = new ContentLikeService(independent, feeds, newsService, posts, promotions, likes, comments, publicComments, notifications, profiles, entityManager).set(1L, "NEWS", 20L, true);
            assertThat(status.type()).isEqualTo("NEWS"); assertThat(status.targetId()).isEqualTo(20L);
            assertThat(status.commentCount()).isZero();
            verify(likes, never()).countByPost_Id(anyLong()); verify(likes, never()).saveAndFlush(any());
            verifyNoInteractions(posts, comments);
        }
    }
    @Test void aDraftCannotExposeComments() {
        var post = post(10L, profile(1L)); post.edit("초안", null, null, null, true, NOW);
        when(posts.findById(10L)).thenReturn(Optional.of(post));
        assertThatThrownBy(() -> commentService().list(10L, 1L, 0, 20)).isInstanceOf(FeedException.class);
        verify(comments, never()).roots(anyLong(), any(), any());
    }
    @Test void aReplyCannotPointAtAnotherPost() {
        var profile = profile(1L); writer(profile); var post = post(10L, profile);
        when(posts.findForUpdate(10L)).thenReturn(Optional.of(post)); when(feeds.isPublic(post)).thenReturn(true);
        when(comments.findForUpdate(30L)).thenReturn(Optional.of(comment(30L, post(99L, profile), profile, null)));
        assertThatThrownBy(() -> commentService().create(1L, 10L, new FeedInteractionDto.CommentRequest("답글", 30L, null, REQUEST))).isInstanceOf(FeedException.class);
        verify(comments, never()).saveAndFlush(any());
    }
    @Test void aSecondReplyLevelIsRejected() {
        var profile = profile(1L); writer(profile); var post = post(10L, profile);
        when(posts.findForUpdate(10L)).thenReturn(Optional.of(post)); when(feeds.isPublic(post)).thenReturn(true);
        when(comments.findForUpdate(30L)).thenReturn(Optional.of(comment(30L, post, profile, comment(20L, post, profile, null))));
        assertThatThrownBy(() -> commentService().create(1L, 10L, new FeedInteractionDto.CommentRequest("답글", 30L, null, REQUEST))).isInstanceOf(FeedException.class);
        verify(comments, never()).saveAndFlush(any());
    }
    @Test void staleRevisionCannotReplaceTheCurrentComment() {
        var profile = profile(1L); writer(profile); var post = post(10L, profile); var item = comment(30L, post, profile, null);
        when(posts.findForUpdate(10L)).thenReturn(Optional.of(post)); when(feeds.isPublic(post)).thenReturn(true);
        when(comments.findById(30L)).thenReturn(Optional.of(item)); when(comments.findForUpdate(30L)).thenReturn(Optional.of(item));
        assertThatThrownBy(() -> commentService().edit(1L, 30L, new FeedInteractionDto.CommentRequest("변경", null, 1L, null)))
            .isInstanceOf(FeedException.class).hasMessageContaining("변경됐어요");
        assertThat(item.getContent()).isEqualTo("원래 댓글"); verify(comments, never()).flush();
    }
    @Test void anotherMemberCannotDeleteAComment() {
        var profile = profile(1L); var post = post(10L, profile); var item = comment(30L, post, profile(2L), null);
        when(feeds.activeWriter(1L)).thenReturn(profile.getMember()); when(posts.findForUpdate(10L)).thenReturn(Optional.of(post));
        when(comments.findById(30L)).thenReturn(Optional.of(item)); when(comments.findForUpdate(30L)).thenReturn(Optional.of(item));
        assertThatThrownBy(() -> commentService().delete(1L, 30L)).isInstanceOf(FeedException.class);
        assertThat(item.getState()).isEqualTo(FeedComment.State.PUBLISHED);
    }
}
