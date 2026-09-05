package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatConcurrencyGuardTest {

    @Mock private ChatRoomRepository roomRepository;
    @Mock private ChatMessageRepository messageRepository;
    @Mock private MemberRepository memberRepository;

    @InjectMocks
    private ChatService chatService;

    @Test
    @DisplayName("내 문의방 열기는 회원과 기존 방을 잠가 중복 생성을 막는다")
    void opensExistingRoomUnderLocks() {
        Member member = member(7L);
        ChatRoom room = room(21L, member);
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(roomRepository.findByMemberIdAndTypeForUpdate(7L, ChatRoom.RoomType.SUPPORT))
                .thenReturn(Optional.of(room));

        ChatRoom result = chatService.openMyRoom(member);

        assertThat(result).isSameAs(room);
        InOrder order = inOrder(memberRepository, roomRepository);
        order.verify(memberRepository).findActiveByIdForUpdate(7L);
        order.verify(roomRepository).findByMemberIdAndTypeForUpdate(7L, ChatRoom.RoomType.SUPPORT);
        verify(roomRepository, never()).save(any(ChatRoom.class));
    }

    @Test
    @DisplayName("관리자 답장은 방 쓰기 잠금 아래 메시지와 안 읽은 수를 함께 갱신한다")
    void adminReplyLocksRoomBeforeIncrementingUnread() {
        Member member = member(7L);
        Member admin = member(1L);
        ChatRoom room = room(21L, member);
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messageRepository.save(any(ChatMessage.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        chatService.sendAsAdmin(admin, 21L, "답변입니다");

        verify(roomRepository).findByIdForUpdate(21L);
        assertThat(room.getMemberUnread()).isEqualTo(1);
        assertThat(room.getAdminUnread()).isZero();
        assertThat(room.getLastMessageAt()).isNotNull();
    }

    private Member member(Long id) {
        return Member.builder().id(id).name("회원" + id).email("member" + id + "@example.com").build();
    }

    private ChatRoom room(Long id, Member member) {
        return ChatRoom.builder()
                .id(id)
                .member(member)
                .type(ChatRoom.RoomType.SUPPORT)
                .memberUnread(0)
                .adminUnread(0)
                .build();
    }
}
