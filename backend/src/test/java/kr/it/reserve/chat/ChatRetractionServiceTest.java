package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatMessageHiddenRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatRetractionService;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatRetractionServiceTest {
    private final ChatService chats = mock(ChatService.class);
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ChatMessageHiddenRepository hidden = mock(ChatMessageHiddenRepository.class);
    private final ChatRetractionService service = new ChatRetractionService(chats, rooms, messages, hidden);
    private final Member actor = Member.builder().id(7L).build();
    private final ChatRoom room = ChatRoom.builder().id(21L).member(actor).build();

    @BeforeEach void privateChangesAreEmptyByDefault() {
        when(hidden.findByMember_IdAndMessage_Room_IdAndIdGreaterThanOrderByIdAsc(anyLong(), anyLong(), anyLong(), any()))
                .thenReturn(new SliceImpl<>(List.of()));
    }

    @Test void oldMessageCanBeRetractedWithoutChangingItsOriginalOrUnreadCounts() {
        ChatMessage message = message(90L, 7L);
        room.onMessageSent(SenderRole.MEMBER, message.getCreatedAt(), message.getContent());
        locked(message);
        when(messages.findLatestByRoomIds(List.of(21L))).thenReturn(List.of(message));

        var result = service.retract(actor, 21L, 90L);

        assertThat(result.isRetracted()).isTrue();
        assertThat(result.getContent()).isEqualTo("전송이 취소된 메시지예요.");
        assertThat(result.getImageUrl()).isNull();
        assertThat(message.getContent()).isEqualTo("원문 보존");
        assertThat(message.getImageKey()).isEqualTo("users/7/chat/21/photo.bin");
        assertThat(room.getRetractionRevision()).isEqualTo(1);
        assertThat(room.getLastMessagePreview()).isEqualTo(result.getContent());
        assertThat(room.getAdminUnread()).isEqualTo(1);
        assertThat(room.getLastMessageAt()).isEqualTo(message.getCreatedAt());
        var order = inOrder(rooms, chats);
        order.verify(rooms).findByIdForUpdate(21L);
        order.verify(chats).assertImageReader(21L, actor);
    }

    @Test void retryIsIdempotentAndRetractingAnOlderMessageDoesNotReplaceTheLatestPreview() {
        ChatMessage older = message(90L, 7L);
        ChatMessage latest = message(91L, 8L);
        room.onMessageSent(SenderRole.ADMIN, latest.getCreatedAt(), "최신 답변");
        locked(older);
        when(messages.findLatestByRoomIds(List.of(21L))).thenReturn(List.of(latest));
        service.retract(actor, 21L, 90L);
        LocalDateTime at = older.getRetractedAt();
        service.retract(actor, 21L, 90L);
        assertThat(room.getRetractionRevision()).isEqualTo(1);
        assertThat(older.getRetractedAt()).isEqualTo(at);
        assertThat(room.getLastMessagePreview()).isEqualTo("최신 답변");
        verify(messages, times(1)).findLatestByRoomIds(List.of(21L));
    }

    @Test void matchingRoleDoesNotAllowRetractingAnotherSendersMessage() {
        ChatMessage other = message(90L, 8L);
        locked(other);
        assertThatThrownBy(() -> service.retract(actor, 21L, 90L))
                .isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(other.isRetracted()).isFalse();
        assertThat(room.getRetractionRevision()).isZero();
    }

    @Test void participantCheckAndRoomMessagePairAreRequiredBeforeAnyMutation() {
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        doThrow(new ChatException("접근 권한이 없어요.", HttpStatus.FORBIDDEN)).when(chats).assertImageReader(21L, actor);
        assertThatThrownBy(() -> service.retract(actor, 21L, 90L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(messages);
        assertThat(room.getRetractionRevision()).isZero();
    }

    @Test void wrongRoomDoesNotFindOrRetractTheMessage() {
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(90L, 21L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.retract(actor, 21L, 90L))
                .isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(room.getRetractionRevision()).isZero();
    }

    @Test void separateBoundedCursorIncludesOldIdsAndOriginalsOnlyInReportContext() {
        ChatMessage older = message(2L, 7L);
        older.retract(LocalDateTime.now(), 9);
        var page = PageRequest.of(0, 100);
        when(messages.findByRoomIdAndRetractionRevisionGreaterThanOrderByRetractionRevisionAsc(21L, 8L, page))
                .thenReturn(new SliceImpl<>(List.of(older), page, true));
        var result = service.changes(actor, 21L, 8);
        assertThat(result.nextRevision()).isEqualTo(9);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.messages()).extracting(ChatMessageResponse::getId).containsExactly(2L);
        assertThat(result.messages().getFirst().getImageUrl()).isNull();
        var evidence = ChatMessageResponse.forReport(older);
        assertThat(evidence.getContent()).isEqualTo("원문 보존");
        assertThat(evidence.getImageUrl()).isEqualTo("/api/chat/images/2");
        assertThat(evidence.isRetracted()).isTrue();
        verify(chats).assertImageReader(21L, actor);
    }

    @Test void negativeCursorIsRejectedWithoutQuerying() {
        assertThatThrownBy(() -> service.changes(actor, 21L, -1))
                .isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(chats, messages);
    }

    private void locked(ChatMessage message) {
        when(rooms.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(message.getId(), 21L)).thenReturn(Optional.of(message));
    }
    private ChatMessage message(long id, long senderId) {
        return ChatMessage.builder().id(id).room(room).senderRole(SenderRole.MEMBER).senderMemberId(senderId)
                .content("원문 보존").createdAt(LocalDateTime.now().minusYears(1))
                .imageKey("users/7/chat/21/photo.bin").imageWidth(100).imageHeight(100).build();
    }
}
