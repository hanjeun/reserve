package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.entity.ChatMessageHidden;
import kr.it.reserve.chat.repository.ChatMessageHiddenRepository;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.event.MemberWithdrawn;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
@RequiredArgsConstructor
public class ChatMessageVisibilityService {
    private final ChatService chats;
    private final ChatRoomRepository rooms;
    private final ChatMessageRepository messages;
    private final ChatMessageHiddenRepository hidden;

    @Transactional
    public ChatMessageResponse hide(Member actor, Long roomId, Long messageId) {
        // 같은 방의 숨김을 직렬화해 중복 생성과 커서의 커밋 순서 역전을 막는다.
        rooms.findByIdForUpdate(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        chats.assertImageReader(roomId, actor);
        var message = messages.findByIdAndRoomId(messageId, roomId)
                .orElseThrow(() -> new ChatException("메시지를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (!hidden.existsByMemberIdAndMessageId(actor.getId(), messageId)) {
            hidden.save(ChatMessageHidden.builder().message(message).member(actor)
                    .hiddenAt(LocalDateTime.now(ZoneOffset.UTC)).build());
        }
        return ChatMessageResponse.from(message, actor.getId(), true);
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        hidden.deleteByMemberId(event.memberId());
    }
}
