package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatRetractionService {
    private final ChatService chats;
    private final ChatRoomRepository rooms;
    private final ChatMessageRepository messages;

    @Transactional
    public ChatMessageResponse retract(Member actor, Long roomId, Long messageId) {
        // 참가자 권한과 발신자 ID를 모두 확인한다. 관리자라도 다른 발신자의 메시지는 취소하지 못한다.
        var room = rooms.findByIdForUpdate(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        // 변경 커서를 읽기 전에 잠근다. 권한 조회가 오래된 managed entity를 먼저 읽지 않게 한다.
        chats.assertImageReader(roomId, actor);
        var message = messages.findByIdAndRoomId(messageId, roomId)
                .orElseThrow(() -> new ChatException("메시지를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (actor.getId() == null || !Objects.equals(message.getSenderMemberId(), actor.getId())) {
            throw new ChatException("본인이 보낸 메시지만 취소할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
        if (!message.isRetracted()) {
            message.retract(LocalDateTime.now(), room.nextRetractionRevision());
            var latest = messages.findLatestByRoomIds(List.of(roomId));
            if (latest.stream().anyMatch(item -> messageId.equals(item.getId()))) {
                room.replaceLastMessagePreview("전송이 취소된 메시지입니다.");
            }
            log.info("Chat message retracted: roomId={}, messageId={}, actorId={}", roomId, messageId, actor.getId());
        }
        return ChatMessageResponse.from(message, actor.getId());
    }

    public Retractions changes(Member actor, Long roomId, long afterRevision) {
        if (afterRevision < 0) throw new ChatException("조회 기준값이 올바르지 않습니다.", HttpStatus.BAD_REQUEST);
        chats.assertImageReader(roomId, actor);
        var page = messages.findByRoomIdAndRetractionRevisionGreaterThanOrderByRetractionRevisionAsc(
                roomId, afterRevision, PageRequest.of(0, 100));
        var updates = page.getContent().stream().map(item -> ChatMessageResponse.from(item, actor.getId())).toList();
        long next = updates.isEmpty() ? afterRevision : updates.getLast().getRetractionRevision();
        return new Retractions(updates, next, page.hasNext());
    }

    public record Retractions(List<ChatMessageResponse> messages, long nextRevision, boolean hasMore) { }
}
