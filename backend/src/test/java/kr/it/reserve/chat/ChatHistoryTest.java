package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatHistoryTest {

    @Mock ChatRoomRepository roomRepository;
    @Mock ChatMessageRepository messageRepository;
    @Mock MemberRepository memberRepository;
    @Mock StoreRepository storeRepository;
    @InjectMocks ChatService chatService;

    @Test
    void returnsOlderMessagesInDisplayOrderWithNextCursor() {
        Member member = Member.builder().id(7L).build();
        ChatRoom room = ChatRoom.builder().id(11L).member(member).build();
        ChatMessage newer = message(3L, room, "셋");
        ChatMessage older = message(2L, room, "둘");
        when(messageRepository.findByRoomIdAndIdLessThanOrderByIdDesc(
                eq(11L), eq(4L), any(PageRequest.class)))
                .thenReturn(new SliceImpl<>(List.of(newer, older), PageRequest.of(0, 50), true));

        var result = chatService.getOlderMessages(11L, 4L, 100);

        assertThat(result.getMessages()).extracting("id").containsExactly(2L, 3L);
        assertThat(result.getNextBeforeId()).isEqualTo(2L);
        assertThat(result.isHasMore()).isTrue();
    }

    private ChatMessage message(Long id, ChatRoom room, String content) {
        return ChatMessage.builder()
                .id(id).room(room).senderRole(SenderRole.MEMBER).senderMemberId(7L)
                .content(content).build();
    }
}
