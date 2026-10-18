package kr.it.reserve.config.updates;

import jakarta.persistence.EntityManager;
import kr.it.reserve.feed.FeedInteractionPolicy;
import kr.it.reserve.feed.entity.ContentLike;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.feed.service.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationUpdates;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import kr.it.reserve.waiting.service.WaitingEventPublisher;
import kr.it.reserve.waiting.service.WaitingAccountCleanup;
import kr.it.reserve.member.event.MemberWithdrawn;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EntityUpdateProducerBoundaryTest {
    @Test
    void aPublicLikeSeparatesPersonalMembershipFromAnonymousAggregateCounters() {
        var fixture = new LikeFixture(true, false);
        fixture.service.set(1L, "POST", 17L, true);
        assertThat(fixture.changes).hasSize(2);
        var personal = fixture.changes.getFirst();
        assertThat(personal.domain()).isEqualTo(EntityUpdates.Domain.LIKE);
        assertThat(personal.members()).containsExactly(1L);
        assertThat(personal.publiclyVisible()).isFalse();
        assertThat(personal.administrators()).isFalse();
        var aggregate = fixture.changes.get(1);
        assertThat(aggregate.domain()).isEqualTo(EntityUpdates.Domain.FEED);
        assertThat(aggregate.members()).isEmpty();
        assertThat(aggregate.publiclyVisible()).isTrue();
        assertThat(aggregate.targetType()).isEqualTo(EntityUpdates.TargetType.POST);
    }

    @Test
    void removingALikeFromAnUnavailableTargetNeverPublishesItsIdentifierToThePublic() {
        var fixture = new LikeFixture(false, true);
        fixture.service.set(1L, "POST", 17L, false);
        assertThat(fixture.changes).hasSize(1);
        assertThat(fixture.changes.getFirst().domain()).isEqualTo(EntityUpdates.Domain.LIKE);
        assertThat(fixture.changes.getFirst().publiclyVisible()).isFalse();
    }

    @Test
    void reservationChangesAreScopedToCustomerOwnerAndAuthorizedAdministrators() {
        List<EntityUpdates.Change> changes = new ArrayList<>();
        EntityUpdates updates = new EntityUpdates(event -> changes.add((EntityUpdates.Change) event));
        Member customer = EntityUpdateStreamTest.member(1, Role.USER);
        Member owner = EntityUpdateStreamTest.member(2, Role.BUSINESS);
        Store store = Store.builder().id(7L).owner(owner).build();
        Reservation reservation = Reservation.builder().id(17L).member(customer).store(store).build();
        new ReservationUpdates(updates).changed(reservation, EntityUpdates.Operation.UPDATED);
        assertThat(changes).hasSize(1);
        assertThat(changes.getFirst().members()).isEqualTo(Set.of(1L, 2L));
        assertThat(changes.getFirst().publiclyVisible()).isFalse();
        assertThat(changes.getFirst().administrators()).isTrue();
        assertThat(changes.getFirst().entityId()).isEqualTo(17L);
        assertThat(changes.getFirst().storeId()).isEqualTo(7L);
    }

    @Test
    void withdrawalRecalculatesWaitingRecipientsAfterAnonymizationAndPublishesOnlyThePublicStoreId() {
        List<EntityUpdates.Change> changes = new ArrayList<>();
        WaitingEntryRepository entries = mock(WaitingEntryRepository.class);
        StoreRepository stores = mock(StoreRepository.class);
        var cleared = new java.util.concurrent.atomic.AtomicBoolean();
        Store store = Store.builder().id(7L).owner(EntityUpdateStreamTest.member(3, Role.BUSINESS)).build();
        when(entries.activeStoreIdsByMember(1L, WaitingStatus.ACTIVE)).thenReturn(List.of(7L));
        when(stores.findById(7L)).thenReturn(Optional.of(store));
        when(entries.activeMemberIds(7L, WaitingStatus.ACTIVE)).thenAnswer(ignored -> cleared.get() ? Set.of(2L) : Set.of(1L, 2L));
        doAnswer(ignored -> { cleared.set(true); return 1; }).when(entries)
                .anonymizeMember(eq(1L), eq(WaitingStatus.ACTIVE), eq(WaitingStatus.CANCELLED), any());
        var publisher = new WaitingEventPublisher(entries, ignored -> { });
        ReflectionTestUtils.setField(publisher, "updates", new EntityUpdates(event -> changes.add((EntityUpdates.Change) event)));
        var cleanup = new WaitingAccountCleanup(entries);
        ReflectionTestUtils.setField(cleanup, "updates", publisher);
        ReflectionTestUtils.setField(cleanup, "stores", stores);

        cleanup.withdraw(new MemberWithdrawn(1L));

        assertThat(changes).hasSize(2);
        var personal = changes.stream().filter(item -> item.domain() == EntityUpdates.Domain.WAITING).findFirst().orElseThrow();
        assertThat(personal.members()).isEqualTo(Set.of(2L, 3L));
        assertThat(personal.publiclyVisible()).isFalse();
        var publicStore = changes.stream().filter(EntityUpdates.Change::publiclyVisible).findFirst().orElseThrow();
        assertThat(publicStore.domain()).isEqualTo(EntityUpdates.Domain.STORE);
        assertThat(publicStore.entityId()).isEqualTo(7L);
        assertThat(publicStore.members()).isEmpty();
    }

    private static final class LikeFixture {
        final List<EntityUpdates.Change> changes = new ArrayList<>();
        final ContentLikeService service;
        LikeFixture(boolean visible, boolean existing) {
            FeedService feeds = mock(FeedService.class);
            FeedPostRepository posts = mock(FeedPostRepository.class);
            ContentLikeRepository likes = mock(ContentLikeRepository.class);
            FeedPost post = mock(FeedPost.class);
            Member member = EntityUpdateStreamTest.member(1, Role.USER);
            when(post.getId()).thenReturn(17L);
            when(posts.findForUpdate(17L)).thenReturn(Optional.of(post));
            when(posts.newsSourceId(17L)).thenReturn(Optional.empty());
            when(feeds.activeWriter(1L)).thenReturn(member);
            when(feeds.isPublic(post)).thenReturn(visible);
            Optional<ContentLike> savedLike = existing ? Optional.of(mock(ContentLike.class)) : Optional.empty();
            when(likes.findByMember_IdAndPost_Id(1L, 17L)).thenReturn(savedLike);
            when(likes.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
            FeedInteractionPolicy policy = mock(FeedInteractionPolicy.class);
            when(policy.isEnabled()).thenReturn(true);
            service = new ContentLikeService(policy, feeds, mock(StoreNewsService.class), posts,
                    mock(PromotionRepository.class), likes, mock(FeedCommentRepository.class), mock(FeedCommentService.class),
                    mock(FeedNotificationService.class), mock(FeedProfileRepository.class), mock(EntityManager.class));
            ReflectionTestUtils.setField(service, "updates", new EntityUpdates(event -> changes.add((EntityUpdates.Change) event)));
        }
    }
}
