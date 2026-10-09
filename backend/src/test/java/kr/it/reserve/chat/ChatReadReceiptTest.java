package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatReadReceiptTest {

    @Mock ChatRoomRepository rooms;
    @Mock ChatMessageRepository messages;
    @Mock MemberRepository members;
    @Mock StoreRepository stores;
    @Mock private kr.it.reserve.chat.repository.ChatMessageHiddenRepository hiddenRepository;
    @InjectMocks ChatService service;

    @Test
    void memberReceiptKeepsNewIncomingAndOlderReceiptCannotIncreaseUnread() {
        Member customer = member(7L, Role.USER);
        ChatRoom room = room(customer, ChatRoom.RoomType.SUPPORT);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        delivered(room, 60L);
        when(messages.countUnreadAfter(21L, 60L, SenderRole.MEMBER)).thenReturn(1L);

        service.markReadAsParticipant(21L, customer, "MEMBER", 60L);

        assertThat(room.getMemberUnread()).isEqualTo(1);
        var order = inOrder(rooms, messages);
        order.verify(rooms).findByIdForUpdate(21L);
        order.verify(messages).findByIdAndRoomId(60L, 21L);
        order.verify(messages).countUnreadAfter(21L, 60L, SenderRole.MEMBER);
        delivered(room, 40L);
        when(messages.countUnreadAfter(21L, 40L, SenderRole.MEMBER)).thenReturn(4L, 5L);

        service.markReadAsParticipant(21L, customer, "MEMBER", 40L);
        assertThat(room.getMemberUnread()).isEqualTo(1);
        room.onMessageSent(SenderRole.ADMIN, LocalDateTime.now(), "뒤늦게 도착한 새 답변");
        service.markReadAsParticipant(21L, customer, "MEMBER", 40L);
        assertThat(room.getMemberUnread()).isEqualTo(2);
    }

    @Test
    void adminReceiptPreservesNewCustomerMessagesAndOtherUnreadAxis() {
        ChatRoom room = room(member(7L, Role.USER), ChatRoom.RoomType.SUPPORT);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        delivered(room, 60L);
        when(messages.countUnreadAfter(21L, 60L, SenderRole.ADMIN)).thenReturn(1L);

        service.markRoomReadAsAdmin(21L, 60L);

        assertThat(room.getAdminUnread()).isEqualTo(1);
        assertThat(room.getMemberUnread()).isEqualTo(5);
        assertThat(room.getOwnerUnread()).isEqualTo(3);
    }

    @Test
    void ownerReceiptChecksStoreOwnershipAndPreservesOtherUnreadAxis() {
        Member owner = member(8L, Role.BUSINESS);
        ChatRoom room = room(member(7L, Role.USER), ChatRoom.RoomType.STORE);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(stores.findById(31L)).thenReturn(Optional.of(Store.builder().id(31L).owner(owner).build()));
        delivered(room, 60L);
        when(messages.countUnreadAfter(21L, 60L, SenderRole.OWNER)).thenReturn(1L);

        service.markReadAsParticipant(21L, owner, "OWNER", 60L);

        assertThat(room.getOwnerUnread()).isEqualTo(1);
        assertThat(room.getMemberUnread()).isEqualTo(5);
        assertThat(room.getAdminUnread()).isEqualTo(4);
    }

    @ParameterizedTest
    @ValueSource(longs = {-1L, 999L})
    void invalidCursorCannotClearUnread(long cursor) {
        Member customer = member(7L, Role.USER);
        ChatRoom room = room(customer, ChatRoom.RoomType.SUPPORT);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> service.markReadAsParticipant(21L, customer, "MEMBER", cursor))
                .isInstanceOfSatisfying(ChatException.class,
                        exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));

        assertThat(room.getMemberUnread()).isEqualTo(5);
        if (cursor < 0) verifyNoInteractions(messages);
    }

    @Test
    void emptyCursorKeepsUnreadAndOmittedCursorKeepsLegacyFullRead() {
        Member customer = member(7L, Role.USER);
        ChatRoom room = room(customer, ChatRoom.RoomType.SUPPORT);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        service.markReadAsParticipant(21L, customer, "MEMBER", 0L);
        assertThat(room.getMemberUnread()).isEqualTo(5);
        service.markReadAsParticipant(21L, customer, "MEMBER");
        assertThat(room.getMemberUnread()).isZero();
        verifyNoInteractions(messages);
    }

    @Test
    void unauthorizedParticipantAndViewerRoleAreRejectedBeforeCursorLookup() {
        Member customer = member(7L, Role.USER);
        ChatRoom room = room(customer, ChatRoom.RoomType.SUPPORT);
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> service.markReadAsParticipant(21L, member(9L, Role.USER), "MEMBER", 60L))
                .isInstanceOfSatisfying(ChatException.class,
                        exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service.markReadAsParticipant(21L, customer, "ADMIN", 60L))
                .isInstanceOfSatisfying(ChatException.class,
                        exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(messages);
        assertThat(room.getMemberUnread()).isEqualTo(5);
    }

    private void delivered(ChatRoom room, Long cursor) {
        when(messages.findByIdAndRoomId(cursor, room.getId())).thenReturn(Optional.of(
                ChatMessage.builder().id(cursor).room(room).senderRole(SenderRole.MEMBER).content("받은 메시지").build()));
    }

    private Member member(Long id, Role role) {
        return Member.builder().id(id).role(role).build();
    }

    private ChatRoom room(Member customer, ChatRoom.RoomType type) {
        return ChatRoom.builder().id(21L).member(customer).type(type).storeId(31L)
                .memberUnread(5).adminUnread(4).ownerUnread(3).build();
    }
}
