package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatRoomStateTest {

    @Test
    void memberMessageRoutesUnreadToSupportAdminOnly() {
        ChatRoom room = room(ChatRoom.RoomType.SUPPORT);

        room.onMessageSent(SenderRole.MEMBER, LocalDateTime.now(), "  문의\n내용  ");

        assertThat(room.getAdminUnread()).isEqualTo(1);
        assertThat(room.getOwnerUnread()).isZero();
        assertThat(room.getMemberUnread()).isZero();
        assertThat(room.getLastMessagePreview()).isEqualTo("문의 내용");
    }

    @Test
    void storeChatKeepsOwnerAndAdminUnreadIndependent() {
        ChatRoom room = room(ChatRoom.RoomType.STORE);

        room.onMessageSent(SenderRole.MEMBER, LocalDateTime.now(), "예약 가능한가요?");
        room.onMessageSent(SenderRole.OWNER, LocalDateTime.now(), "네, 가능합니다.");

        assertThat(room.getAdminUnread()).isZero();
        assertThat(room.getOwnerUnread()).isZero();
        assertThat(room.getMemberUnread()).isEqualTo(1);
    }

    @Test
    void eitherStoreParticipantBlockFreezesTheRoomButEachSideOnlyClearsItsOwnFlag() {
        ChatRoom room = room(ChatRoom.RoomType.STORE);
        LocalDateTime now = LocalDateTime.now();

        room.setBlocked(SenderRole.MEMBER, true, now);
        room.setBlocked(SenderRole.OWNER, true, now.plusSeconds(1));
        room.setBlocked(SenderRole.MEMBER, false, now.plusSeconds(2));

        assertThat(room.isBlocked()).isTrue();
        assertThat(room.isBlockedBy(SenderRole.MEMBER)).isFalse();
        assertThat(room.isBlockedBy(SenderRole.OWNER)).isTrue();
        assertThatThrownBy(() -> room.setBlocked(SenderRole.ADMIN, true, now))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private ChatRoom room(ChatRoom.RoomType type) {
        return ChatRoom.builder()
                .type(type)
                .memberUnread(0)
                .adminUnread(0)
                .ownerUnread(0)
                .build();
    }
}
