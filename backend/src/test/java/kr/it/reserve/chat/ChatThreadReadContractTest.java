package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatThreadReadContractTest {
    private enum UnavailableStore { MISSING, DELETED, SUSPENDED }

    @Mock ChatRoomRepository rooms;
    @Mock ChatMessageRepository messages;
    @Mock MemberRepository members;
    @Mock StoreRepository stores;
    @Mock private kr.it.reserve.chat.repository.ChatMessageHiddenRepository hiddenRepository;
    @InjectMocks ChatService service;

    @Test
    void ownerThreadQueryPreservesUnreadUntilTheExplicitReadAndKeepsOwnerIdentity() {
        Member owner = Member.builder().id(8L).role(Role.BUSINESS).build();
        ChatRoom room = room();
        Store store = Store.builder().id(31L).owner(owner).status(StoreStatus.ACTIVE).build();
        when(rooms.findById(21L)).thenReturn(Optional.of(room));
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        emptyMessageWindow();

        var queried = service.getRoomAsOwner(owner, 21L);
        assertThat(queried.getViewerRole()).isEqualTo("OWNER");
        assertThat(queried.getTitle()).isEqualTo("고객");
        assertThat(queried.isCanSend()).isTrue();
        assertThat(room.getOwnerUnread()).isEqualTo(3);

        var read = service.readRoomAsOwner(owner, 21L);
        assertThat(read.getViewerRole()).isEqualTo("OWNER");
        assertThat(room.getOwnerUnread()).isZero();
        assertThat(room.getMemberUnread()).isEqualTo(4);
        assertThat(room.getAdminUnread()).isEqualTo(5);
        verify(rooms, never()).save(any());
        verify(messages, never()).save(any());
    }

    @Test
    void participantReadClearsOnlyTheAuthenticatedMembersUnreadAxis() {
        ChatRoom room = room();
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        service.markReadAsParticipant(21L, room.getMember(), "MEMBER");

        assertThat(room.getMemberUnread()).isZero();
        assertThat(room.getOwnerUnread()).isEqualTo(3);
        assertThat(room.getAdminUnread()).isEqualTo(5);
        verifyNoInteractions(messages, members, stores);
    }

    @ParameterizedTest
    @EnumSource(UnavailableStore.class)
    void unavailableStoreStillAllowsReadingHistoryButDisablesSending(UnavailableStore unavailable) {
        ChatRoom room = room();
        when(rooms.findByMemberIdAndTypeAndStoreId(7L, ChatRoom.RoomType.STORE, 31L))
                .thenReturn(Optional.of(room));
        Store store = Store.builder().id(31L).status(StoreStatus.ACTIVE).build();
        switch (unavailable) {
            case MISSING -> when(stores.findById(31L)).thenReturn(Optional.empty());
            case DELETED -> {
                store.setDeletedAt(LocalDateTime.of(2026, 10, 3, 0, 0));
                when(stores.findById(31L)).thenReturn(Optional.of(store));
            }
            case SUSPENDED -> {
                store.setStatus(StoreStatus.SUSPENDED);
                when(stores.findById(31L)).thenReturn(Optional.of(store));
            }
        }
        emptyMessageWindow();

        var response = service.getStoreConversation(room.getMember(), 31L);

        assertThat(response.getViewerRole()).isEqualTo("MEMBER");
        assertThat(response.isCanSend()).isFalse();
        assertThat(response.getMessages()).isEmpty();
        assertThat(room.getMemberUnread()).isEqualTo(4);
        assertThat(room.getOwnerUnread()).isEqualTo(3);
        verify(rooms, never()).save(any());
        verify(messages, never()).save(any());
    }

    private void emptyMessageWindow() {
        when(messages.findByRoomIdOrderByIdDesc(21L, PageRequest.of(0, 50)))
                .thenReturn(new SliceImpl<>(List.of()));
    }

    private static ChatRoom room() {
        Member customer = Member.builder().id(7L).name("고객").role(Role.USER).build();
        return ChatRoom.builder().id(21L).member(customer).type(ChatRoom.RoomType.STORE)
                .storeId(31L).storeNameSnapshot("가게").memberUnread(4).ownerUnread(3).adminUnread(5).build();
    }
}
