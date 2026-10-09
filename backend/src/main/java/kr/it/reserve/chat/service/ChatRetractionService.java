package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatMessageHiddenRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatRetractionService {
    private final ChatService chats;
    private final ChatRoomRepository rooms;
    private final ChatMessageRepository messages;
    private final ChatMessageHiddenRepository hidden;

    @Transactional
    public ChatMessageResponse retract(Member actor, Long roomId, Long messageId) {
        // 참가자 권한과 발신자 ID를 모두 확인한다. 관리자라도 다른 발신자의 메시지는 취소하지 못한다.
        var room = rooms.findByIdForUpdate(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        // 변경 커서를 읽기 전에 잠근다. 권한 조회가 오래된 managed entity를 먼저 읽지 않게 한다.
        chats.assertImageReader(roomId, actor);
        var message = messages.findByIdAndRoomId(messageId, roomId)
                .orElseThrow(() -> new ChatException("메시지를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (actor.getId() == null || !Objects.equals(message.getSenderMemberId(), actor.getId())) {
            throw new ChatException("본인이 보낸 메시지만 취소할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        if (message.isPurged()) throw new ChatException("보존 기간이 지난 메시지예요.", HttpStatus.GONE);
        if (!message.isRetracted()) {
            message.retract(LocalDateTime.now(Clock.systemDefaultZone()), room.nextRetractionRevision());
            var latest = messages.findLatestByRoomIds(List.of(roomId));
            if (latest.stream().anyMatch(item -> messageId.equals(item.getId()))) {
                room.replaceLastMessagePreview("전송이 취소된 메시지예요.");
            }
            log.info("Chat message retracted: roomId={}, messageId={}, actorId={}", roomId, messageId, actor.getId());
        }
        return ChatMessageResponse.from(message, actor.getId(), hidden.existsByMemberIdAndMessageId(actor.getId(), messageId));
    }

    public Retractions changes(Member actor, Long roomId, long afterRevision) {
        return changes(actor, roomId, afterRevision, 0);
    }

    public Retractions changes(Member actor, Long roomId, long afterRevision, long afterHiddenId) {
        if (afterRevision < 0 || afterHiddenId < 0) throw new ChatException("조회 기준값이 올바르지 않아요.", HttpStatus.BAD_REQUEST);
        chats.assertImageReader(roomId, actor);
        var page = messages.findByRoomIdAndRetractionRevisionGreaterThanOrderByRetractionRevisionAsc(
                roomId, afterRevision, PageRequest.of(0, 100));
        Set<Long> hiddenIds = page.isEmpty() ? Set.of() : Set.copyOf(hidden.findHiddenMessageIds(
                actor.getId(), page.getContent().stream().map(item -> item.getId()).toList()));
        var updates = page.getContent().stream().map(item -> ChatMessageResponse.from(item, actor.getId(), hiddenIds.contains(item.getId()))).toList();
        long next = updates.isEmpty() ? afterRevision : updates.getLast().getRetractionRevision();
        // 개인 삭제 커서는 본인 계정/방만 읽는다. 상대방에게 숨김 여부를 보내지 않는다.
        var hiddenPage = hidden.findByMember_IdAndMessage_Room_IdAndIdGreaterThanOrderByIdAsc(
                actor.getId(), roomId, afterHiddenId, PageRequest.of(0, 100));
        var deletedIds = hiddenPage.getContent().stream().map(item -> item.getMessage().getId()).toList();
        long nextHiddenId = hiddenPage.isEmpty() ? afterHiddenId : hiddenPage.getContent().getLast().getId();
        return new Retractions(updates, next, page.hasNext(), deletedIds, nextHiddenId, hiddenPage.hasNext());
    }

    public record Retractions(List<ChatMessageResponse> messages, long nextRevision, boolean hasMore,
                              List<Long> hiddenMessageIds, long nextHiddenId, boolean hasMoreHidden) { }
}
