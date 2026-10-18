package kr.it.reserve.promotion;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.feed.repository.FeedMediaRepository;
import kr.it.reserve.feed.repository.FeedPostRepository;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.feed.news.service.StoreNewsService;
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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StoreNewsMutationBoundaryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");
    private static final String REQUEST_ID = "d4887b47-ef27-4a25-9488-49a76a4b4532";
    @Mock StoreNewsAvailability policy;
    @Mock FeedService feeds;
    @Mock PromotionRepository promotions;
    @Mock FeedPostRepository posts;
    @Mock FeedMediaRepository media;
    @Mock MemberRepository members;
    @Mock StoreRepository stores;
    @Mock EntityManager entityManager;
    @InjectMocks StoreNewsService service;
    private Member owner;
    private Store store;
    private FeedProfile profile;
    private Promotion news;

    @BeforeEach
    void setUp() {
        owner = Member.builder().id(7L).role(Role.BUSINESS).termsAgreed(true).build();
        store = Store.builder().id(3L).owner(owner).name("가게").address("서울 강남구").build();
        profile = FeedProfile.create(owner, NOW);
        news = Promotion.builder().id(11L).member(owner).store(store).title("현재 제목").content("현재 정본")
                .category(Promotion.PromotionCategory.CAFE).createdAt(NOW).updatedAt(NOW).build();
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void currentStoreOwnerCreatesOneCanonicalOriginalAndReferenceOnlyCarrier(Role role) {
        owner.setRole(role);
        writable();
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
        when(promotions.saveAndFlush(any())).thenAnswer(invocation -> {
            Promotion created = invocation.getArgument(0);
            created.setId(11L); created.setUpdatedAt(NOW); return created;
        });
        when(posts.saveAndFlush(any())).thenAnswer(invocation -> {
            FeedPost post = invocation.getArgument(0); ReflectionTestUtils.setField(post, "id", 20L); return post;
        });

        OffsetDateTime start = OffsetDateTime.parse("2026-10-11T12:00:00+09:00");
        var result = service.create(7L, request(3L, "EVENT", start, start.plusHours(1), List.of(41L), false, null));

        var original = org.mockito.ArgumentCaptor.forClass(Promotion.class);
        var carrier = org.mockito.ArgumentCaptor.forClass(FeedPost.class);
        var order = inOrder(feeds, stores, promotions, posts);
        order.verify(feeds).activeWriter(7L);
        order.verify(stores).findByIdForUpdate(3L);
        order.verify(promotions).saveAndFlush(original.capture());
        order.verify(posts).saveAndFlush(carrier.capture());
        order.verify(feeds).applyMedia(carrier.getValue(), List.of(41L), 7L);
        assertThat(original.getValue().getContent()).isEqualTo("새 원문");
        assertThat(original.getValue().getStartsAt()).isEqualTo(LocalDateTime.parse("2026-10-11T03:00:00"));
        assertThat(result.startsAt()).isEqualTo(OffsetDateTime.parse("2026-10-11T03:00:00Z"));
        assertThat(carrier.getValue().getContent()).isEmpty();
        assertThat(carrier.getValue().getNewsPromotion()).isSameAs(original.getValue());
        assertThat(result.feedEnabled()).isFalse();
        assertThat(result.feedPostId()).isNull();
        verify(feeds, never()).writableProfile(anyLong());
    }

    @Test
    void regularMemberAndAdministratorOfAnotherStoreCannotBypassOwnership() {
        owner.setRole(Role.USER);
        when(feeds.activeWriter(7L)).thenReturn(owner);
        assertStatus(() -> service.create(7L, request(3L, "NEWS", null, null, List.of(), false, null)), HttpStatus.FORBIDDEN);
        verify(feeds, never()).writableProfile(anyLong());
        verifyNoInteractions(stores, promotions, posts, media);

        owner.setRole(Role.ADMIN);
        when(feeds.mediaProfile(owner)).thenReturn(profile);
        store.setOwner(Member.builder().id(9L).role(Role.BUSINESS).termsAgreed(true).build());
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
        assertStatus(() -> service.create(7L, request(3L, "NEWS", null, null, List.of(), false, null)), HttpStatus.FORBIDDEN);
        verify(promotions, never()).saveAndFlush(any());
        verify(posts, never()).saveAndFlush(any());
    }

    @Test
    void staleRevisionStopsTextAndPhotoChangesAfterCurrentOwnershipLocks() {
        locked(); news.setRevision(3L);

        assertStatus(() -> service.edit(7L, 11L, request(3L, "NEWS", null, null, List.of(41L), false, 2L)), HttpStatus.CONFLICT);

        assertThat(news.getTitle()).isEqualTo("현재 제목");
        assertThat(news.getContent()).isEqualTo("현재 정본");
        verify(entityManager).refresh(news, LockModeType.PESSIMISTIC_WRITE);
        verify(feeds, never()).applyMedia(any(), anyList(), anyLong());
        verifyNoInteractions(posts, media);
    }

    @Test
    void editCannotMoveOriginalToAnotherStoreOrTurnPublishedNewsBackIntoADraft() {
        locked();

        assertStatus(() -> service.edit(7L, 11L, request(99L, "NEWS", null, null, List.of(), false, 0L)), HttpStatus.BAD_REQUEST);
        assertStatus(() -> service.edit(7L, 11L, request(3L, "NEWS", null, null, List.of(), true, 0L)), HttpStatus.BAD_REQUEST);

        assertThat(news.getStore()).isSameAs(store);
        assertThat(news.getState()).isEqualTo(Promotion.State.PUBLISHED);
        verify(stores, never()).findByIdForUpdate(99L);
        verify(feeds, never()).applyMedia(any(), anyList(), anyLong());
    }

    @Test
    void duplicateOrSevenPhotosAndInvalidPeriodFailBeforeEitherOriginalIsSaved() {
        writable(); when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
        OffsetDateTime start = OffsetDateTime.parse("2026-10-11T12:00:00+09:00");
        List<StoreNewsDto.Request> invalid = List.of(
                request(3L, "NEWS", null, null, List.of(41L, 41L), false, null),
                request(3L, "NEWS", null, null, List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L), false, null),
                request(3L, "NEWS", start, null, List.of(), false, null),
                request(3L, "EVENT", start, start, List.of(), false, null),
                request(3L, "BENEFIT", start, null, List.of(), false, null));

        for (var request : invalid) assertStatus(() -> service.create(7L, request), HttpStatus.BAD_REQUEST);

        verify(promotions, never()).saveAndFlush(any());
        verify(posts, never()).saveAndFlush(any());
        verify(feeds, never()).applyMedia(any(), anyList(), anyLong());
    }

    @Test
    void repeatedUuidReturnsSameCanonicalOriginalWithoutReattachingPhotos() {
        writable();
        FeedPost original = FeedPost.create(profile, REQUEST_ID, NOW);
        original.linkNews(news, "서울", NOW);
        ReflectionTestUtils.setField(original, "id", 20L);
        when(posts.findByProfile_Member_IdAndClientRequestId(7L, REQUEST_ID)).thenReturn(Optional.of(original));

        var result = service.create(7L, request(3L, "NEWS", null, null, List.of(41L), false, null));

        assertThat(result.id()).isEqualTo(11L);
        assertThat(result.content()).isEqualTo("현재 정본");
        verify(promotions, never()).saveAndFlush(any());
        verify(posts, never()).saveAndFlush(any());
        verify(feeds, never()).applyMedia(any(), anyList(), anyLong());
        verifyNoInteractions(stores);
    }

    @Test
    void deletedOriginalAndCarrierRemainForRetentionWithoutPhysicalDeletion() {
        when(feeds.activeWriter(7L)).thenReturn(owner);
        when(promotions.findById(11L)).thenReturn(Optional.of(news));
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
        FeedPost carrier = FeedPost.create(profile, REQUEST_ID, NOW);
        carrier.linkNews(news, "서울", NOW);

        service.delete(7L, 11L);

        var order = inOrder(stores, entityManager);
        order.verify(stores).findByIdForUpdate(3L);
        order.verify(entityManager).refresh(news, LockModeType.PESSIMISTIC_WRITE);
        order.verify(entityManager).refresh(carrier, LockModeType.PESSIMISTIC_WRITE);
        assertThat(news.getState()).isEqualTo(Promotion.State.DELETED);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.DELETED);
        assertThat(news.getContent()).isEqualTo("현재 정본");
        assertThat(carrier.getDeletedAt()).isEqualTo(news.getDeletedAt());
        verify(promotions, never()).delete(any(Promotion.class));
        verifyNoInteractions(media);
    }

    private void writable() {
        when(feeds.activeWriter(7L)).thenReturn(owner);
        when(feeds.mediaProfile(owner)).thenReturn(profile);
    }
    private void locked() {
        writable();
        when(promotions.findById(11L)).thenReturn(Optional.of(news));
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
    }
    private StoreNewsDto.Request request(Long storeId, String type, OffsetDateTime start, OffsetDateTime end,
                                         List<Long> ids, boolean draft, Long revision) {
        return new StoreNewsDto.Request(storeId, "새 제목", "새 원문", type, start, end, "이용 조건", true, ids, draft, revision, REQUEST_ID, false);
    }
    private void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }
}
