package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatMessageResponse;
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
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreChatServiceTest {

    @Mock ChatRoomRepository roomRepository;
    @Mock ChatMessageRepository messageRepository;
    @Mock MemberRepository memberRepository;
    @Mock StoreRepository storeRepository;
    @InjectMocks ChatService chatService;

    @Test
    void createsOneCustomerStoreRoomWithNameSnapshot() {
        Member customer = member(7L);
        Store store = store(31L, member(8L));
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(customer));
        when(roomRepository.findStoreChatForUpdate(7L, ChatRoom.RoomType.STORE, 31L))
                .thenReturn(Optional.empty());
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store));
        when(roomRepository.save(any(ChatRoom.class))).thenAnswer(call -> call.getArgument(0));

        ChatRoom room = chatService.openStoreRoom(customer, 31L);

        assertThat(room.getType()).isEqualTo(ChatRoom.RoomType.STORE);
        assertThat(room.getStoreId()).isEqualTo(31L);
        assertThat(room.getStoreNameSnapshot()).isEqualTo("가게31");
    }

    @Test
    void customerStoreConversationUsesCurrentRepresentativeImageInListAndThread() {
        Member customer = member(7L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.STORE).storeId(31L)
                .storeNameSnapshot("가게31").lastMessagePreview("최근 문의").build();
        Store store = Store.builder().id(31L).owner(member(8L)).name("가게31")
                .mainImageUrl("/uploads/current-store.jpg").status(StoreStatus.ACTIVE).build();
        when(roomRepository.findForMember(7L, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));
        when(storeRepository.findAllById(List.of(31L))).thenReturn(List.of(store));

        var summary = chatService.listMyConversations(customer, 0).getContent().getFirst();
        assertThat(summary.getStoreImageUrl()).isEqualTo("/uploads/current-store.jpg");

        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(customer));
        when(roomRepository.findStoreChatForUpdate(7L, ChatRoom.RoomType.STORE, 31L))
                .thenReturn(Optional.of(room));
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store));
        when(messageRepository.findByRoomIdOrderByIdDesc(21L, PageRequest.of(0, 50)))
                .thenReturn(new SliceImpl<>(List.of()));

        var thread = chatService.openStoreConversation(customer, 31L);
        assertThat(thread.getStoreImageUrl()).isEqualTo("/uploads/current-store.jpg");
        assertThat(thread.getTitle()).isEqualTo("가게31");
    }

    @Test
    void rejectsSendingToOwnStore() {
        Member owner = member(7L);
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(owner));
        when(roomRepository.findStoreChatForUpdate(7L, ChatRoom.RoomType.STORE, 31L))
                .thenReturn(Optional.empty());
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));

        assertThatThrownBy(() -> chatService.openStoreRoom(owner, 31L))
                .hasMessageContaining("내 가게");
        verify(roomRepository, never()).save(any(ChatRoom.class));
    }

    @Test
    void idempotentAdminRetryReturnsExistingMessageWithoutIncrementingUnread() {
        Member customer = member(7L);
        Member admin = member(1L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.SUPPORT)
                .memberUnread(0).adminUnread(0).ownerUnread(0).build();
        ChatMessage existing = ChatMessage.builder()
                .id(55L).room(room).senderRole(SenderRole.ADMIN).senderMemberId(1L)
                .clientMessageId("same-id").content("답변").build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messageRepository.findByRoomIdAndSenderMemberIdAndClientMessageId(21L, 1L, "same-id"))
                .thenReturn(Optional.of(existing));

        var response = chatService.sendAsAdmin(admin, 21L, "답변", "same-id");

        assertThat(response.getId()).isEqualTo(55L);
        assertThat(room.getMemberUnread()).isZero();
        verify(messageRepository, never()).save(any(ChatMessage.class));
    }

    @Test
    void adminPollRejectsStoreConversationBeforeReadingMessages() {
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(member(7L)).type(ChatRoom.RoomType.STORE).storeId(31L)
                .memberUnread(3).ownerUnread(2).build();
        when(roomRepository.findById(21L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatService.getNewMessagesAsAdmin(21L, 55L))
                .isInstanceOf(ChatException.class)
                .hasMessageContaining("대화 유형")
                .extracting("status").isEqualTo(HttpStatus.FORBIDDEN);

        verifyNoInteractions(messageRepository);
        assertThat(room.getMemberUnread()).isEqualTo(3);
        assertThat(room.getOwnerUnread()).isEqualTo(2);
    }

    @Test
    void adminPollReturnsSupportMessagesAfterCursorWithoutChangingUnread() {
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(member(7L)).type(ChatRoom.RoomType.SUPPORT)
                .memberUnread(3).adminUnread(2).ownerUnread(0).build();
        ChatMessage first = ChatMessage.builder()
                .id(56L).room(room).senderRole(SenderRole.MEMBER).content("문의").build();
        ChatMessage second = ChatMessage.builder()
                .id(57L).room(room).senderRole(SenderRole.ADMIN).content("답변").build();
        when(roomRepository.findById(21L)).thenReturn(Optional.of(room));
        when(messageRepository.findByRoomIdAndIdGreaterThanOrderByIdAsc(21L, 55L, PageRequest.of(0, 50)))
                .thenReturn(new SliceImpl<>(List.of(first, second)));

        var responses = chatService.getNewMessagesAsAdmin(21L, 55L);

        assertThat(responses).extracting(ChatMessageResponse::getId).containsExactly(56L, 57L);
        verify(messageRepository).findByRoomIdAndIdGreaterThanOrderByIdAsc(21L, 55L, PageRequest.of(0, 50));
        assertThat(room.getMemberUnread()).isEqualTo(3);
        assertThat(room.getAdminUnread()).isEqualTo(2);
        assertThat(room.getOwnerUnread()).isZero();
        verify(messageRepository, never()).save(any(ChatMessage.class));
    }

    @Test
    void adminMessengerReadClearsOnlyAdminUnread() {
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(member(7L)).type(ChatRoom.RoomType.SUPPORT)
                .memberUnread(3).adminUnread(2).ownerUnread(0).build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        chatService.markRoomReadAsAdmin(21L);

        assertThat(room.getAdminUnread()).isZero();
        assertThat(room.getMemberUnread()).isEqualTo(3);
        assertThat(room.getOwnerUnread()).isZero();
    }

    @Test
    void adminLauncherUnreadIncludesCustomerSupportMessages() {
        Member admin = Member.builder().id(1L).name("관리자").email("admin@example.com")
                .role(Role.ADMIN).build();
        when(roomRepository.sumMemberUnread(1L)).thenReturn(1L);
        when(roomRepository.sumAdminUnread(ChatRoom.RoomType.SUPPORT)).thenReturn(3L);

        assertThat(chatService.totalUnreadCount(admin)).isEqualTo(4L);
    }

    @Test
    void ownerReadClearsOnlyTheOwnerUnreadAxis() {
        Member customer = member(7L);
        Member owner = businessMember(8L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.STORE).storeId(31L)
                .memberUnread(3).ownerUnread(2).build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));

        chatService.markReadAsParticipant(21L, owner, "OWNER");

        assertThat(room.getOwnerUnread()).isZero();
        assertThat(room.getMemberUnread()).isEqualTo(3);
    }

    @Test
    void roleDemotionHidesStoreInboxAndDeniesExistingStoreRoomAccess() {
        Member formerOwner = member(8L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(member(7L)).type(ChatRoom.RoomType.STORE).storeId(31L)
                .memberUnread(3).ownerUnread(2).build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(roomRepository.findById(21L)).thenReturn(Optional.of(room));

        assertThat(chatService.listStoreInbox(formerOwner, 0).getContent()).isEmpty();
        assertThatThrownBy(() -> chatService.readRoomAsOwner(formerOwner, 21L))
                .isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> chatService.assertParticipant(21L, formerOwner))
                .isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(HttpStatus.FORBIDDEN);
        when(roomRepository.sumMemberUnread(8L)).thenReturn(1L);
        assertThat(chatService.totalUnreadCount(formerOwner)).isEqualTo(1L);

        verify(storeRepository, never()).findByOwnerId(8L);
        verify(storeRepository, never()).findById(31L);
        assertThat(room.getOwnerUnread()).isEqualTo(2);
    }

    @Test
    void rejectsAnUnknownReadPerspective() {
        Member customer = member(7L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.SUPPORT).build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatService.markReadAsParticipant(21L, customer, "ADMIN"))
                .hasMessageContaining("역할");
    }

    @Test
    void blockedStoreRoomRejectsNewMessagesWithoutWriting() {
        Member customer = member(7L);
        ChatRoom room = ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.STORE).storeId(31L)
                .build();
        room.setBlocked(SenderRole.OWNER, true, java.time.LocalDateTime.now());
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(customer));
        when(roomRepository.findStoreChatForUpdate(7L, ChatRoom.RoomType.STORE, 31L))
                .thenReturn(Optional.of(room));
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, member(8L))));

        assertThatThrownBy(() -> chatService.sendAsMemberToStore(
                customer, 31L, "보내기 시도", "client-1"))
                .hasMessageContaining("차단");
        verify(messageRepository, never()).save(any(ChatMessage.class));
    }

    private Member member(Long id) {
        return Member.builder().id(id).name("회원" + id).email("member" + id + "@example.com").build();
    }

    private Member businessMember(Long id) {
        return Member.builder().id(id).name("사업자" + id).email("business" + id + "@example.com")
                .role(Role.BUSINESS).build();
    }

    private Store store(Long id, Member owner) {
        return Store.builder()
                .id(id).owner(owner).name("가게" + id).status(StoreStatus.ACTIVE)
                .build();
    }
}
