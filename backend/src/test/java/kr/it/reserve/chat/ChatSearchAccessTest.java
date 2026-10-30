package kr.it.reserve.chat;

import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.search.ChatSearchService;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@Import(ChatSearchService.class)
class ChatSearchAccessTest {
    @Autowired EntityManager em;
    @Autowired ChatSearchService search;
    @MockitoBean ChatService chats;

    @Test void searchSeparatesMemberOwnerAndSupportAdminWithoutMarkingRead() {
        var owner = member("가게 주인", Role.BUSINESS); var me = member("합성 손님", Role.USER);
        var other = member("다른 손님", Role.USER); var admin = member("관리자", Role.ADMIN);
        var store = store(owner); var own = room(me, store); var foreign = room(other, store);
        var support = room(other, null); var a = message(own, "합성검색 본문"); message(foreign, "합성검색 비공개"); message(support, "합성검색 상담"); em.flush();
        assertThat(search.search(me, "합성검색", "messages", 0).messages()).extracting(ChatSearchService.Hit::messageId).containsExactly(a.getId());
        assertThat(search.search(owner, "합성검색", "messages", 0).messages()).hasSize(2).allMatch(hit -> hit.kind().equals("owner"));
        assertThat(search.search(admin, "합성검색", "messages", 0).messages()).hasSize(1).allMatch(hit -> hit.kind().equals("admin"));
        assertThat(search.search(owner, "합성 손님", "conversations", 0).conversations()).extracting(ChatSearchService.Hit::roomId).containsExactly(own.getId());
        assertThat(search.search(admin, "다른 손님", "conversations", 0).conversations()).extracting(ChatSearchService.Hit::roomId).containsExactly(support.getId());
        em.refresh(own); assertThat(own.getMemberUnread()).isEqualTo(2); assertThat(own.getOwnerUnread()).isEqualTo(3);
    }

    @Test void hiddenBlockedExpiredRetractedAndPurgedContentNeverAppears() {
        var me = member("손님", Role.USER); var room = room(me, null);
        var visible = message(room, "보호검색 정상"); var hidden = message(room, "보호검색 숨김");
        var retracted = message(room, "보호검색 취소"); var purged = message(room, "보호검색 파기"); var expired = message(room, "보호검색 만료");
        em.persist(ChatMessageHidden.builder().message(hidden).member(me).hiddenAt(now()).build());
        ReflectionTestUtils.setField(retracted, "retractedAt", now()); ReflectionTestUtils.setField(purged, "purgedAt", now());
        em.flush();
        em.createNativeQuery("UPDATE chat_message SET created_at = :at WHERE id = :id")
                .setParameter("at", now().minusDays(91)).setParameter("id", expired.getId()).executeUpdate();
        assertThat(search.search(me, "보호검색", "messages", 0).messages()).extracting(ChatSearchService.Hit::messageId).containsExactly(visible.getId());
        ReflectionTestUtils.setField(room, "memberHiddenAt", now()); em.flush();
        assertThat(search.search(me, "보호검색", "messages", 0).messages()).isEmpty();
        ReflectionTestUtils.setField(room, "memberHiddenAt", null); ReflectionTestUtils.setField(room, "ownerBlockedAt", now()); em.flush();
        assertThat(search.search(me, "보호검색", "messages", 0).messages()).isEmpty();
    }

    @Test void messageContextRechecksOwnershipAndPersonalDeletion() {
        var me = member("손님", Role.USER); var other = member("다른 손님", Role.USER);
        var own = room(me, null); var foreign = room(other, null); var a = message(own, "검색 위치"); var b = message(foreign, "비공개 위치"); em.flush();
        assertThatThrownBy(() -> search.context(me, foreign.getId(), b.getId())).isInstanceOf(ChatException.class);
        verifyNoInteractions(chats);
        when(chats.getSearchContext(me, own.getId(), a.getId())).thenReturn(ConversationThreadResponse.builder().roomId(own.getId()).messages(List.of()).build());
        assertThat(search.context(me, own.getId(), a.getId()).getRoomId()).isEqualTo(own.getId());
        em.persist(ChatMessageHidden.builder().message(a).member(me).hiddenAt(now()).build()); em.flush();
        assertThatThrownBy(() -> search.context(me, own.getId(), a.getId())).isInstanceOf(ChatException.class);
        verify(chats, times(1)).getSearchContext(me, own.getId(), a.getId());
    }

    @Test void wildcardEscapingAndCurrentDatabaseRolePreventWiderSearch() {
        var owner = member("주인", Role.BUSINESS); var customer = member("손님", Role.USER); var room = room(customer, store(owner));
        var exact = message(room, "100% 확인"); message(room, "다른 내용"); em.flush();
        assertThat(search.search(owner, "%", "messages", 0).messages()).extracting(ChatSearchService.Hit::messageId).containsExactly(exact.getId());
        em.detach(owner); em.find(Member.class, owner.getId()).setRole(Role.USER); em.flush();
        assertThat(search.search(owner, "%", "messages", 0).messages()).isEmpty();
    }

    @Test void historyAdminAccessIsLimitedToSupportRooms() {
        var admin = member("관리자", Role.ADMIN); var other = member("손님", Role.USER); var support = room(other, null); var store = room(other, store(member("주인", Role.BUSINESS)));
        var repository = mock(ChatRoomRepository.class); var service = mock(ChatService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(service, "roomRepository", repository);
        when(repository.findById(support.getId())).thenReturn(Optional.of(support)); when(repository.findById(store.getId())).thenReturn(Optional.of(store));
        assertThatCode(() -> service.assertHistoryAccess(support.getId(), admin)).doesNotThrowAnyException();
        assertThatThrownBy(() -> service.assertHistoryAccess(store.getId(), admin)).isInstanceOf(ChatException.class);
    }

    private Member member(String name, Role role) {
        var value = Member.builder().name(name).email(UUID.randomUUID() + "@example.invalid").password("fixture-password")
                .role(role).status(MemberStatus.ACTIVE).termsAgreed(true).build(); em.persist(value); return value;
    }
    private Store store(Member owner) { var value = Store.builder().name("합성 가게").owner(owner).build(); em.persist(value); return value; }
    private ChatRoom room(Member member, Store store) {
        var value = ChatRoom.builder().member(member).type(store == null ? ChatRoom.RoomType.SUPPORT : ChatRoom.RoomType.STORE)
                .storeId(store == null ? null : store.getId()).storeNameSnapshot(store == null ? null : store.getName())
                .memberUnread(2).ownerUnread(3).adminUnread(4).lastMessageAt(now()).build(); em.persist(value); return value;
    }
    private ChatMessage message(ChatRoom room, String content) {
        var value = ChatMessage.builder().room(room).senderRole(SenderRole.MEMBER).senderMemberId(room.getMember().getId()).content(content).createdAt(now()).build();
        em.persist(value); return value;
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
