package kr.it.reserve.chat;

import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class ChatRollbackCompatibilityTest {
    @Autowired ChatRoomRepository rooms;
    @Autowired ChatMessageRepository messages;
    @Autowired MemberRepository members;
    @Autowired EntityManager entityManager;

    @Test void ownerValuesDeserializeButStoreRoomsStayOutOfOldAdminApis() {
        Member member = members.save(Member.builder().name("합성 회원").email("rollback@example.invalid").build());
        ChatRoom support = rooms.save(ChatRoom.builder().member(member).type(ChatRoom.RoomType.SUPPORT).adminUnread(1).build());
        ChatRoom store = rooms.save(ChatRoom.builder().member(member).type(ChatRoom.RoomType.STORE).adminUnread(3).build());
        ChatMessage owner = messages.save(ChatMessage.builder().room(store).senderRole(SenderRole.OWNER).content("합성 대화").build());
        messages.flush(); entityManager.clear();
        assertThat(messages.findById(owner.getId()).orElseThrow().getSenderRole()).isEqualTo(SenderRole.OWNER);
        assertThat(rooms.findAllForAdmin(ChatRoom.RoomType.SUPPORT, PageRequest.of(0, 20))).extracting(ChatRoom::getId).containsExactly(support.getId());
        assertThat(rooms.countRoomsWaitingForAdmin(ChatRoom.RoomType.SUPPORT)).isEqualTo(1);
        ChatService service = new ChatService(rooms, messages, members);
        assertThatThrownBy(() -> service.readRoomAsAdmin(store.getId())).hasMessageContaining("대화를 찾을 수 없습니다");
        assertThatThrownBy(() -> service.getNewMessages(store.getId(), 0L)).hasMessageContaining("대화를 찾을 수 없습니다");
    }

    @Test void oldResponseMasksRetainedOriginalAndDoesNotExposeEncryptedPhotoLocation() {
        ChatMessage retracted = ChatMessage.builder().id(1L).senderRole(SenderRole.MEMBER).content("보존 원문")
                .imageKey("users/1/chat/1/photo.bin").retractedAt(LocalDateTime.now()).build();
        assertThat(ChatMessageResponse.from(retracted).getContent()).isEqualTo("전송이 취소된 메시지입니다.");
        ChatMessage photo = ChatMessage.builder().id(2L).senderRole(SenderRole.MEMBER).content("")
                .imageKey("users/1/chat/1/photo.bin").build();
        assertThat(ChatMessageResponse.from(photo).getContent()).isEqualTo("사진 메시지입니다. 새 버전에서 확인해주세요.");
    }
}
