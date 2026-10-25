package kr.it.reserve.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.waiting.entity.*;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.service.CustomerWaitingService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Committed synthetic rows exercise SQL filtering before the bounded result window, with no external effects. */
@SpringBootTest(properties = "FEED_ENABLED=true")
class SearchPersistenceTest {
    @Autowired SearchQueries queries;
    @Autowired SearchService service;
    @Autowired CustomerWaitingService waitingService;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @Autowired ObjectMapper json;
    TransactionTemplate tx;
    Member owner, customer, other;
    Store store;
    String needle;
    final List<Long> members = new ArrayList<>(), stores = new ArrayList<>(), profiles = new ArrayList<>(),
            promotions = new ArrayList<>(), posts = new ArrayList<>(), reservations = new ArrayList<>(),
            waiting = new ArrayList<>(), rooms = new ArrayList<>(), messages = new ArrayList<>();

    @BeforeEach void fixture() {
        tx = new TransactionTemplate(manager); needle = "find-" + UUID.randomUUID().toString().substring(0, 8);
        tx.executeWithoutResult(status -> {
            owner = member(Role.BUSINESS); customer = member(Role.USER); other = member(Role.USER);
            store = store(owner, needle + " 가게");
        });
    }
    @AfterEach void cleanupOnlyOwnedRows() {
        tx.executeWithoutResult(status -> {
            delete("chat_message_hidden", "message_id", messages); delete("chat_message", "id", messages);
            delete("chat_room", "id", rooms); delete("waiting_entry", "waiting_entry_id", waiting);
            delete("reservation", "reservation_id", reservations); delete("feed_post", "post_id", posts);
            delete("promotion", "promotion_id", promotions); delete("feed_profile", "profile_id", profiles);
            delete("store", "store_id", stores); delete("member", "member_id", members);
        });
        for (var ids : List.of(members, stores, profiles, promotions, posts, reservations, waiting, rooms, messages)) ids.clear();
    }

    @Test void publicQueriesApplyVisibilityAndPeriodBeforeTakingTheWindow() throws Exception {
        Long[] expected = new Long[2];
        tx.executeWithoutResult(status -> {
            expected[0] = promotion(Promotion.State.PUBLISHED, Promotion.BenefitState.APPROVED, false).getId();
            promotion(Promotion.State.DRAFT, Promotion.BenefitState.APPROVED, false);
            promotion(Promotion.State.HIDDEN, Promotion.BenefitState.APPROVED, false);
            promotion(Promotion.State.DELETED, Promotion.BenefitState.APPROVED, false);
            promotion(Promotion.State.PUBLISHED, Promotion.BenefitState.PENDING, false);
            promotion(Promotion.State.PUBLISHED, Promotion.BenefitState.APPROVED, true);
            var future = promotion(Promotion.State.PUBLISHED, Promotion.BenefitState.APPROVED, false);
            future.setStartsAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
            FeedProfile profile = profile(owner);
            expected[1] = post(profile, false).getId();
            post(profile, true);
            post(profile, false).setVisibility(true, utc());
            post(profile, false).delete(utc());
            var inconsistentDeleted = post(profile, false); inconsistentDeleted.delete(utc()); inconsistentDeleted.setVisibility(false, utc());
            var carrier = post(profile, false); carrier.linkNews(future, "서울", utc());
            var hiddenProfile = profile(customer); hiddenProfile.withdraw(utc()); post(hiddenProfile, false);
            var hiddenStore = store(owner, needle + " 숨김"); hiddenStore.setDeletedAt(utc());
            var suspendedStore = store(owner, needle + " 정지"); suspendedStore.setStatus(StoreStatus.SUSPENDED);
            suspendedStore.setSuspendedUntil(LocalDateTime.now().plusDays(1));
            var bannedOwner = member(Role.BUSINESS); bannedOwner.ban("synthetic"); store(bannedOwner, needle + " 제재");
            var deletedOwner = member(Role.BUSINESS); deletedOwner.setDeletedAt(utc()); store(deletedOwner, needle + " 탈퇴");
        });
        var input = SearchQuery.from(needle, 5);
        assertThat(queries.stores(input)).extracting(SearchResponse.Item::id).containsExactly(store.getId());
        assertThat(queries.benefits(input)).extracting(SearchResponse.Item::id).containsExactly(expected[0]);
        assertThat(queries.feed(input)).extracting(SearchResponse.Item::id).containsExactly(expected[1]);
        String body = json.writeValueAsString(service.publicSearch(needle, 5));
        assertThat(body).doesNotContain("private-image-marker", "imageUrl", "senderMemberId", "email", "phone");
    }

    @Test void resultLimitAndWildcardEscapingAreAppliedByTheDatabase() {
        Long[] literal = new Long[1];
        tx.executeWithoutResult(status -> {
            for (int index = 0; index < 8; index++) store(owner, needle + " 추가 " + index);
            literal[0] = store(owner, "only-100%_!-" + needle).getId();
            store(owner, "only-100ZZ-" + needle);
        });
        assertThat(queries.stores(SearchQuery.from(needle, 5))).hasSize(6);
        var group = service.publicSearch(needle, 5).groups().getFirst();
        assertThat(group.items()).hasSize(5); assertThat(group.hasMore()).isTrue();
        assertThat(queries.stores(SearchQuery.from("100%_!", 5))).extracting(SearchResponse.Item::id).containsExactly(literal[0]);
        assertThat(queries.stores(SearchQuery.from("%' OR 1=1 --", 5))).isEmpty();
    }

    @Test void reservationAndWaitingSearchStayOwnedAndKeepTheExistingPersonalWindow() throws Exception {
        Long[] expected = new Long[5];
        tx.executeWithoutResult(status -> {
            expected[0] = reservation(customer, false).getId(); reservation(other, false); reservation(customer, true);
            expected[1] = waiting(customer, false).getId(); expected[2] = waiting(customer, true).getId();
            var expired = waiting(customer, true); expected[3] = expired.getId();
            em.flush(); jdbc.update("UPDATE waiting_entry SET finished_at = ? WHERE waiting_entry_id = ?",
                    Timestamp.valueOf(utc().minusDays(2)), expired.getId());
            waiting(other, false);
            var erased = waiting(customer, false); expected[4] = erased.getId(); em.flush();
            jdbc.update("UPDATE waiting_entry SET member_id = NULL WHERE waiting_entry_id = ?", erased.getId());
        });
        var input = SearchQuery.from(needle, 5);
        assertThat(queries.reservations(input, customer.getId())).extracting(SearchResponse.Item::id).containsExactly(expected[0]);
        assertThat(queries.waiting(input, customer.getId())).extracting(SearchResponse.Item::id)
                .containsExactlyInAnyOrder(expected[1], expected[2]);
        assertThat(waitingService.mine(customer, 0, 20).getContent()).extracting(row -> row.entry().id())
                .containsExactlyInAnyOrder(expected[1], expected[2]);
        assertThat(waitingService.personalEntry(customer, expected[1]).entry().id()).isEqualTo(expected[1]);
        assertThat(waitingService.personalEntry(customer, expected[2]).entry().id()).isEqualTo(expected[2]);
        assertThatThrownBy(() -> waitingService.personalEntry(other, expected[1])).isInstanceOfSatisfying(WaitingException.class,
                failure -> assertThat(failure.getStatus().value()).isEqualTo(404));
        assertThatThrownBy(() -> waitingService.personalEntry(customer, expected[3])).isInstanceOfSatisfying(WaitingException.class,
                failure -> assertThat(failure.getStatus().value()).isEqualTo(404));
        assertThatThrownBy(() -> waitingService.personalEntry(customer, expected[4])).isInstanceOfSatisfying(WaitingException.class,
                failure -> assertThat(failure.getStatus().value()).isEqualTo(404));
        String body = json.writeValueAsString(service.personalSearch(needle, 5, customer));
        assertThat(body).doesNotContain("private-contact-marker", "private-image-marker", "imageUrl", "displayName", "specialRequest");
    }

    @Test void messagesExcludeOtherParticipantsHiddenBlockedRetractedPurgedAndOldOriginals() throws Exception {
        Long[] own = new Long[3];
        tx.executeWithoutResult(status -> {
            ChatRoom room = room(customer, store, false, false, false);
            own[0] = message(room).getId();
            var individuallyHidden = message(room);
            em.persist(ChatMessageHidden.builder().message(individuallyHidden).member(customer).hiddenAt(utc()).build());
            var retracted = message(room); retracted.retract(utc(), 1);
            var purged = message(room); em.flush();
            jdbc.update("UPDATE chat_message SET purged_at = ? WHERE id = ?", Timestamp.valueOf(utc()), purged.getId());
            var old = message(room); em.flush();
            jdbc.update("UPDATE chat_message SET created_at = ? WHERE id = ?", Timestamp.valueOf(LocalDateTime.now().minusDays(91)), old.getId());
            message(room(customer, store, true, false, false));
            message(room(customer, store, false, true, false));
            message(room(customer, store, false, false, true));
            message(room(other, null, false, false, false));
            own[1] = message(room(customer, null, false, false, false)).getId();
            own[2] = room.getId();
        });
        var input = SearchQuery.from(needle, 5);
        var hits = queries.messages(input, customer.getId(), false);
        assertThat(hits).extracting(SearchResponse.Item::id).containsExactlyInAnyOrder(own[0], own[1]);
        assertThat(hits).extracting(SearchResponse.Item::path).containsExactlyInAnyOrder(
                "/messages?storeId=" + store.getId(), "/messages?kind=support");
        assertThat(hits).allSatisfy(hit -> assertThat(hit.description().length()).isLessThanOrEqualTo(160));
        String body = json.writeValueAsString(hits);
        assertThat(body).doesNotContain("private-image-marker", "imageKey", "imageUrl", "senderMemberId");
        assertThat(jdbc.queryForObject("SELECT member_unread FROM chat_room WHERE id = ?", Integer.class, own[2])).isEqualTo(2);
    }

    @Test void businessMessageRightsAreCurrentOwnershipAndNeverAnAdminWideSupportSearch() {
        Long[] visible = new Long[1]; Member[] admin = new Member[1];
        tx.executeWithoutResult(status -> {
            visible[0] = message(room(customer, store, false, false, false)).getId();
            var hiddenOwner = room(other, store, false, false, false);
            hiddenOwner.setHidden(SenderRole.OWNER, true, owner.getId(), utc()); message(hiddenOwner);
            admin[0] = member(Role.ADMIN); message(room(other, null, false, false, false));
        });
        var input = SearchQuery.from(needle, 5);
        assertThat(queries.messages(input, owner.getId(), true)).extracting(SearchResponse.Item::id).containsExactly(visible[0]);
        assertThat(queries.messages(input, admin[0].getId(), true)).isEmpty();
        tx.executeWithoutResult(status -> em.find(Member.class, owner.getId()).setRole(Role.USER));
        assertThat(queries.messages(input, owner.getId(), true)).isEmpty();
    }

    @Test void erasedMembershipIsNotAnExactWaitingNavigationTargetAndReadsDoNotMutateDomains() {
        Long[] entry = new Long[1];
        tx.executeWithoutResult(status -> {
            reservation(customer, false); entry[0] = waiting(customer, false).getId();
            message(room(customer, store, false, false, false));
            promotion(Promotion.State.PUBLISHED, Promotion.BenefitState.APPROVED, false);
            post(profile(owner), false);
        });
        var before = counts();
        service.publicSearch(needle, 5); service.personalSearch(needle, 5, customer); waitingService.personalEntry(customer, entry[0]);
        assertThat(counts()).isEqualTo(before);
        tx.executeWithoutResult(status -> em.find(Member.class, customer.getId()).setDeletedAt(utc()));
        assertThatThrownBy(() -> waitingService.personalEntry(customer, entry[0])).isInstanceOfSatisfying(WaitingException.class,
                failure -> assertThat(failure.getStatus().value()).isEqualTo(404));
    }

    private List<Long> counts() {
        return List.of(jdbc.queryForObject("SELECT COUNT(*) FROM reservation", Long.class),
                jdbc.queryForObject("SELECT COUNT(*) FROM waiting_entry", Long.class),
                jdbc.queryForObject("SELECT COUNT(*) FROM chat_room", Long.class),
                jdbc.queryForObject("SELECT COALESCE(SUM(view_count),0) FROM promotion", Long.class),
                jdbc.queryForObject("SELECT COALESCE(SUM(member_unread+owner_unread+admin_unread),0) FROM chat_room", Long.class));
    }
    private Member member(Role role) {
        Member row = Member.builder().name("synthetic").email("search-" + UUID.randomUUID() + "@example.test")
                .password("synthetic").role(role).provider(AuthProvider.LOCAL).termsAgreed(true).build();
        em.persist(row); members.add(row.getId()); return row;
    }
    private Store store(Member member, String title) {
        Store row = Store.builder().owner(member).name(title).category("스튜디오").description(title)
                .address("서울 테스트").mainImageUrl("https://synthetic.invalid/private-image-marker").build();
        em.persist(row); stores.add(row.getId()); return row;
    }
    private Promotion promotion(Promotion.State state, Promotion.BenefitState approved, boolean ended) {
        Promotion row = Promotion.builder().member(owner).store(store).title(needle + " 혜택").content(needle + " 공개 혜택")
                .category(Promotion.PromotionCategory.ETC).state(state).benefitState(approved)
                .startsAt(utc().minusDays(2)).endsAt(ended ? utc().minusDays(1) : utc().plusDays(2))
                .imageUrl("https://synthetic.invalid/private-image-marker").build();
        em.persist(row); promotions.add(row.getId()); return row;
    }
    private FeedProfile profile(Member member) {
        FeedProfile row = FeedProfile.create(member, utc());
        row.update(needle, "search-" + UUID.randomUUID(), "", false, utc());
        em.persist(row); profiles.add(row.getId()); return row;
    }
    private FeedPost post(FeedProfile profile, boolean draft) {
        FeedPost row = FeedPost.create(profile, UUID.randomUUID().toString(), utc());
        row.edit(needle + " 공개 피드", "서울", null, null, draft, utc());
        em.persist(row); posts.add(row.getId()); return row;
    }
    private Reservation reservation(Member member, boolean deleted) {
        Reservation row = Reservation.builder().member(member).store(store).reservationDate(ServiceTime.today().plusDays(1))
                .reservationTime(LocalTime.NOON).guestCount(1).specialRequest(needle + " private-contact-marker")
                .reservationCode("R-" + UUID.randomUUID().toString().substring(0, 8)).build();
        if (deleted) row.setDeletedAt(utc());
        em.persist(row); reservations.add(row.getId()); return row;
    }
    private WaitingEntry waiting(Member member, boolean finished) {
        WaitingEntry row = WaitingEntry.createForCustomer(store.getId(), ServiceTime.today(), waiting.size() + 1,
                "private-contact-marker", 1, UUID.randomUUID().toString(), utc(), member.getId(), WaitingSource.REMOTE, utc().minusDays(40));
        if (finished) row.changeStatus(WaitingStatus.CANCELLED, utc());
        em.persist(row); waiting.add(row.getId()); return row;
    }
    private ChatRoom room(Member member, Store store, boolean hidden, boolean memberBlocked, boolean ownerBlocked) {
        ChatRoom row = ChatRoom.builder().member(member).type(store == null ? ChatRoom.RoomType.SUPPORT : ChatRoom.RoomType.STORE)
                .storeId(store == null ? null : store.getId()).storeNameSnapshot(store == null ? null : store.getName())
                .memberHiddenAt(hidden ? utc() : null).memberBlockedAt(memberBlocked ? utc() : null)
                .ownerBlockedAt(ownerBlocked ? utc() : null).memberUnread(2).ownerUnread(3).adminUnread(4).build();
        em.persist(row); rooms.add(row.getId()); return row;
    }
    private ChatMessage message(ChatRoom room) {
        ChatMessage row = ChatMessage.builder().room(room).senderRole(SenderRole.MEMBER).senderMemberId(room.getMember().getId())
                .content(needle + " " + "본문".repeat(170)).imageKey("encrypted/private-image-marker").build();
        em.persist(row); messages.add(row.getId()); return row;
    }
    private LocalDateTime utc() { return LocalDateTime.now(ZoneOffset.UTC); }
    private void delete(String table, String column, List<Long> ids) {
        if (!ids.isEmpty()) jdbc.update("DELETE FROM " + table + " WHERE " + column + " IN ("
                + String.join(",", Collections.nCopies(ids.size(), "?")) + ")", ids.toArray());
    }
}
