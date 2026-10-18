package kr.it.reserve.feed.service;

import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.HttpStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedPostBoundaryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");
    private static final String REQUEST = "71dd1ab9-48db-4ca6-8a0b-473806924bcd";
    enum NewsAuthority { REGULAR_MEMBER, TRANSFERRED_STORE, CLOSED_STORE }
    @Mock private FeedPolicy policy;
    @Mock private FeedProfileRepository profiles;
    @Mock private FeedPostRepository posts;
    @Mock private FeedMediaRepository media;
    @Mock private MemberRepository members;
    @Mock private StoreRepository stores;
    @Mock private PromotionRepository promotions;
    @Mock private FileStorageService storage;
    @Mock private FileDeletionOutboxService fileDeletions;
    @InjectMocks private FeedService feeds;

    @Test
    void benefitMediaOwnershipCannotExposeAnUnconfiguredPublicProfile() {
        Member owner = member(7L);
        FeedProfile internal = FeedProfile.mediaOwner(owner, NOW);
        when(members.findByIdAndDeletedAtIsNull(7L)).thenReturn(Optional.of(owner));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(internal));
        when(profiles.findByPublicId(internal.getPublicId())).thenReturn(Optional.of(internal));

        assertThat(feeds.myProfile(7L)).isNull();
        assertThatThrownBy(() -> feeds.publicProfile(internal.getPublicId())).isInstanceOf(FeedException.class);
        assertThatThrownBy(() -> feeds.writableProfile(7L)).isInstanceOf(FeedException.class);
        assertThat(feeds.isPublic(post(internal))).isFalse();
        assertThat(internal.getNickname()).isEmpty();
        verifyNoInteractions(media, storage);
    }

    @Test
    void anotherAccountsUploadCannotBeAttached() {
        Member author = member(7L);
        FeedProfile profile = profile(author);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(posts.saveAndFlush(any())).thenAnswer(invocation -> {
            FeedPost post = invocation.getArgument(0); ReflectionTestUtils.setField(post, "id", 20L); return post;
        });
        FeedMedia foreign = FeedMedia.create(member(9L), "foreign.bin", "image/jpeg", 10, 10, 100, NOW);
        when(media.findForUpdate(41L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> feeds.create(7L, request(List.of(41L), null))).isInstanceOf(FeedException.class);
        assertThat(foreign.getPost()).isNull();
        verify(media, never()).flush();
    }

    @Test
    void identicalRequestReturnsOriginalBeforeCheckingAlreadyAttachedMedia() {
        Member author = member(7L); FeedProfile profile = profile(author);
        FeedPost previous = post(profile); previous.edit("처음 게시한 내용", "서울", null, null, false, NOW);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(posts.findByProfile_Member_IdAndClientRequestId(7L, REQUEST)).thenReturn(Optional.of(previous));
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of());

        FeedDto.Post result = feeds.create(7L, request(List.of(41L), REQUEST));

        assertThat(result.id()).isEqualTo(20L);
        assertThat(result.content()).isEqualTo("처음 게시한 내용");
        verify(posts, never()).saveAndFlush(any());
        verify(media, never()).findForUpdate(anyLong());
        verifyNoInteractions(stores, promotions);
    }

    @Test
    void deletedPostIsUnavailableToOwnerAnonymousAndOtherReaders() {
        FeedPost deleted = post(profile(member(7L)));
        deleted.edit("지워진 원문", "서울", null, null, false, NOW); deleted.delete(NOW);
        when(posts.findById(20L)).thenReturn(Optional.of(deleted));

        for (Long viewer : new Long[]{7L, null, 9L}) {
            assertThatThrownBy(() -> feeds.readPost(20L, viewer)).isInstanceOfSatisfying(FeedException.class,
                    exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        }
        verifyNoInteractions(media);
    }

    @Test
    void staleRevisionDoesNotEditTextOrAttachments() {
        Member author = member(7L); FeedProfile profile = profile(author); FeedPost post = post(profile);
        post.edit("현재 내용", null, null, null, false, NOW); ReflectionTestUtils.setField(post, "revision", 3L);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(post));
        var request = new FeedDto.PostRequest("오래된 수정", null, null, null, List.of(), false, 2L, null);

        assertThatThrownBy(() -> feeds.edit(7L, 20L, request)).isInstanceOf(FeedException.class);
        assertThat(post.getContent()).isEqualTo("현재 내용");
        verifyNoInteractions(media);
    }

    @Test
    void ordinaryFeedEditorCannotOverwriteCanonicalNewsOrItsPhotoRevision() {
        Member author = member(7L); FeedProfile profile = profile(author); FeedPost carrier = post(profile);
        Promotion news = news(author); carrier.linkNews(news, "서울", NOW); news.setRevision(3L);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(carrier));
        var request = new FeedDto.PostRequest("피드에서 바꿀 원문", null, null, null, List.of(41L), false, 0L, null);

        assertThatThrownBy(() -> feeds.edit(7L, 20L, request)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT));

        assertThat(news.getContent()).isEqualTo("소식 정본");
        assertThat(news.getRevision()).isEqualTo(3L);
        assertThat(carrier.getContent()).isEmpty();
        verifyNoInteractions(media);
        verify(posts, never()).flush();
    }

    @Test
    void ordinaryFeedRequestCannotReuseStoreNewsCreationUuid() {
        Member author = member(7L); FeedProfile profile = profile(author); FeedPost carrier = post(profile);
        carrier.linkNews(news(author), "서울", NOW);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(posts.findByProfile_Member_IdAndClientRequestId(7L, REQUEST)).thenReturn(Optional.of(carrier));

        assertThatThrownBy(() -> feeds.create(7L, request(List.of(41L), REQUEST)))
                .isInstanceOfSatisfying(FeedException.class, exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));

        verify(posts, never()).saveAndFlush(any());
        verifyNoInteractions(media, stores, promotions);
    }

    @Test
    void deletedCanonicalNewsNeverLeaksOriginalMetadataThroughOwnerFeedTombstone() {
        Member author = member(7L); FeedPost carrier = post(profile(author)); Promotion news = news(author);
        carrier.linkNews(news, "서울", NOW); news.deleteNews(NOW);
        when(posts.findById(20L)).thenReturn(Optional.of(carrier));

        assertThatThrownBy(() -> feeds.readPost(20L, 7L)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThat(news.getContent()).isEqualTo("소식 정본");
        verifyNoInteractions(media);
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void feedDeleteCannotChangeBenefitEvenForItsBusinessOwnerOrAdmin(Role role) {
        Member author = member(7L); author.setRole(role);
        FeedPost carrier = post(profile(author)); Promotion news = news(author); carrier.linkNews(news, "서울", NOW);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(posts.newsSourceId(20L)).thenReturn(Optional.of(12L));

        assertThatThrownBy(() -> feeds.delete(7L, 20L)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        var order = inOrder(members, posts, stores, promotions);
        order.verify(members).findActiveByIdForUpdate(7L);
        order.verify(posts).newsSourceId(20L);
        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.PUBLISHED);
        assertThat(news.getDeletedAt()).isNull();
        assertThat(carrier.getDeletedAt()).isNull();
        assertThat(news.getContent()).isEqualTo("소식 정본");
        verify(posts, never()).findForUpdate(anyLong());
        verifyNoInteractions(stores, promotions, media);
    }

    @ParameterizedTest
    @EnumSource(NewsAuthority.class)
    void feedRouteCannotBypassCurrentNewsRoleAndUsableStoreOwnership(NewsAuthority authority) {
        Member author = member(7L); author.setRole(authority == NewsAuthority.REGULAR_MEMBER ? Role.USER : Role.BUSINESS);
        FeedPost carrier = post(profile(author)); Promotion news = news(author); carrier.linkNews(news, "서울", NOW);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(author));
        when(posts.newsSourceId(20L)).thenReturn(Optional.of(12L));
        if (authority != NewsAuthority.REGULAR_MEMBER) {
            if (authority == NewsAuthority.TRANSFERRED_STORE) news.getStore().setOwner(member(9L));
            else news.getStore().softDelete();
        }

        assertThatThrownBy(() -> feeds.delete(7L, 20L)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        assertThat(news.getDeletedAt()).isNull();
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.PUBLISHED);
        verify(posts, never()).findForUpdate(20L);
        verify(promotions, never()).findForUpdate(12L);
        verifyNoInteractions(media);
    }

    @Test
    void anotherAccountCannotDeleteCanonicalNewsEvenWhenItKnowsFeedCarrierId() {
        Member writer = member(7L); writer.setRole(Role.ADMIN);
        Promotion news = news(member(9L));
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(writer));
        when(posts.newsSourceId(20L)).thenReturn(Optional.of(12L));

        assertThatThrownBy(() -> feeds.delete(7L, 20L)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        verify(posts, never()).findForUpdate(anyLong());
        verify(promotions, never()).findForUpdate(anyLong());
        verifyNoInteractions(stores, media);
    }

    @Test
    void regularMemberKeepsOwnOrdinaryFeedDeletionWithoutBusinessStoreGate() {
        Member writer = member(7L); writer.setRole(Role.USER); FeedPost post = post(profile(writer));
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(writer));
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(post));

        feeds.delete(7L, 20L);

        assertThat(post.getState()).isEqualTo(FeedPost.State.DELETED);
        assertThat(post.getContent()).isEqualTo("처음 원문");
        verifyNoInteractions(stores, promotions, media);
    }

    @Test
    void aDraftEntersTheLatestListAtPublicationTimeAndEditsKeepThatTime() {
        FeedPost draft = FeedPost.create(profile(member(7L)), REQUEST, NOW);
        draft.edit("초안", null, null, null, true, NOW);
        LocalDateTime published = NOW.plusDays(2);
        draft.edit("처음 공개", null, null, null, false, published);
        assertThat(draft.getCreatedAt()).isEqualTo(published);
        draft.edit("내용 수정", null, null, null, false, published.plusHours(1));
        assertThat(draft.getCreatedAt()).isEqualTo(published);
        assertThat(draft.getUpdatedAt()).isEqualTo(published.plusHours(1));
    }

    @Test
    void withdrawalCleanupRunsIndependentlyOfDisabledApiPolicy() {
        assertThat(new FeedPolicy(false).isEnabled()).isFalse();
        FeedProfile profile = profile(member(7L));
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));

        new FeedAccountCleanup(posts, profiles, storage, fileDeletions).withdraw(new MemberWithdrawn(7L));

        assertThat(profile.isHidden()).isTrue();
        assertThat(profile.getNickname()).isEqualTo("탈퇴한 회원");
        assertThat(profile.getNicknameKey()).isEqualTo("withdrawn:" + profile.getPublicId());
        assertThat(profile.getBio()).isNull();
        assertThat(profile.isUseAccountAvatar()).isFalse();
        verify(posts).withdraw(eq(7L), eq(FeedPost.State.DELETED), any(LocalDateTime.class));
        verifyNoInteractions(policy);
    }

    @Test
    void storeClosureInvokesNewsCarrierCleanupEvenWithFeedApiDisabled() {
        new FeedAccountCleanup(posts, profiles, storage, fileDeletions).closeStore(new kr.it.reserve.store.event.StoreClosed(3L));

        verify(posts).closeStoreNews(eq(3L), any(LocalDateTime.class));
        verify(posts, never()).withdraw(anyLong(), any(), any(LocalDateTime.class));
        verifyNoInteractions(policy, profiles);
    }

    private static FeedDto.PostRequest request(List<Long> images, String nonce) {
        return new FeedDto.PostRequest("새 글", null, null, null, images, false, null, nonce);
    }
    private Promotion news(Member author) {
        Store store = Store.builder().id(3L).owner(author).name("가게").build();
        return Promotion.builder().id(12L).member(author).store(store).title("소식 제목").content("소식 정본")
                .category(Promotion.PromotionCategory.CAFE).createdAt(NOW).updatedAt(NOW).build();
    }
    static Member member(Long id) { return Member.builder().id(id).termsAgreed(true).build(); }
    static FeedProfile profile(Member member) {
        FeedProfile profile = FeedProfile.create(member, NOW); profile.update("공개 닉네임", "공개 닉네임", "소개", false, NOW);
        ReflectionTestUtils.setField(profile, "id", 11L); return profile;
    }
    static FeedPost post(FeedProfile profile) {
        FeedPost post = FeedPost.create(profile, REQUEST, NOW); ReflectionTestUtils.setField(post, "id", 20L);
        post.edit("처음 원문", null, null, null, false, NOW); return post;
    }
}
