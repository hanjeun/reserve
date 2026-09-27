package kr.it.reserve.chat;

import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class ChatLatestPreviewQueryTest {
    @Autowired ChatMessageRepository messageRepository;
    @Autowired ChatRoomRepository roomRepository;
    @Autowired MemberRepository memberRepository;
    @Autowired EntityManager entityManager;

    @Test
    void oneLatestMessagePerAuthorizedRoomRegardlessOfSenderRole() {
        Member customer = memberRepository.save(Member.builder()
                .name("손님").email("chat-preview-query@example.invalid").build());
        ChatRoom first = roomRepository.save(ChatRoom.builder()
                .member(customer).type(ChatRoom.RoomType.SUPPORT).build());
        ChatRoom second = roomRepository.save(ChatRoom.builder()
                .member(customer).type(ChatRoom.RoomType.SUPPORT).build());
        ChatRoom unrelated = roomRepository.save(ChatRoom.builder()
                .member(customer).type(ChatRoom.RoomType.SUPPORT).build());
        save(first, SenderRole.MEMBER, "오래된 질문");
        ChatMessage firstLatest = save(first, SenderRole.ADMIN, "최근 답변");
        ChatMessage secondLatest = save(second, SenderRole.MEMBER, "최근 질문");
        save(unrelated, SenderRole.ADMIN, "다른 방의 답변");
        messageRepository.flush();
        entityManager.clear();

        var messages = messageRepository.findLatestByRoomIds(List.of(first.getId(), second.getId()));

        assertThat(messages).extracting(ChatMessage::getId)
                .containsExactlyInAnyOrder(firstLatest.getId(), secondLatest.getId());
        assertThat(messages).extracting(ChatMessage::getContent)
                .containsExactlyInAnyOrder("최근 답변", "최근 질문");
    }

    private ChatMessage save(ChatRoom room, SenderRole role, String content) {
        return messageRepository.save(ChatMessage.builder()
                .room(room).senderRole(role).content(content).build());
    }
}
