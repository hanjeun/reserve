package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatImagePayload;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatImageCipher;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.Optional;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatImageSafetyTest {
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ChatService chats = new ChatService(rooms, messages, mock(MemberRepository.class), mock(StoreRepository.class), mock(kr.it.reserve.chat.repository.ChatMessageHiddenRepository.class));
    private final Member owner = Member.builder().id(1L).role(Role.USER).build();
    private final ChatRoom room = ChatRoom.builder().id(10L).member(owner).type(ChatRoom.RoomType.SUPPORT).build();

    @Test
    void encryptsUniquelyAndAuthenticatesTheRoomAndBytes() {
        var cipher = new ChatImageCipher(Base64.getEncoder().encodeToString(new byte[32]));
        byte[] image = new byte[]{1, 2, 3, 4};
        byte[] encrypted = cipher.encrypt(image, "users/1/chat/10");
        assertThat(encrypted).hasSize(image.length + 28).isNotEqualTo(image);
        assertThat(cipher.encrypt(image, "users/1/chat/10")).isNotEqualTo(encrypted);
        assertThat(cipher.decrypt(encrypted, "users/1/chat/10")).isEqualTo(image);
        assertThatThrownBy(() -> cipher.decrypt(encrypted, "users/1/chat/11")).isInstanceOf(IllegalStateException.class);
        encrypted[encrypted.length - 1] ^= 1;
        assertThatThrownBy(() -> cipher.decrypt(encrypted, "users/1/chat/10")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void absentKeyDisablesImagesAndInvalidKeyFailsClosed() {
        var cipher = new ChatImageCipher("");
        assertThat(cipher.isEnabled()).isFalse();
        assertThatThrownBy(() -> cipher.encrypt(new byte[]{1}, "room")).isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> new ChatImageCipher("AAAA")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nonParticipantCannotUploadOrReadSupportImage() {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        Supplier<ChatImagePayload> upload = mock(Supplier.class);
        Member stranger = Member.builder().id(2L).role(Role.USER).build();
        assertThatThrownBy(() -> chats.sendImage(stranger, 10L, "", "attempt", upload)).isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> chats.assertImageReader(10L, stranger)).isInstanceOf(ChatException.class);
        verifyNoInteractions(upload);
        verifyNoInteractions(messages);
    }

    @Test
    void retryReturnsExistingMessageWithoutUploadingAgain() {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        var existing = ChatMessage.builder().id(30L).room(room).senderRole(SenderRole.MEMBER)
                .imageKey("users/1/chat/10/image.bin").content("").clientMessageId("attempt").build();
        when(messages.findByRoomIdAndSenderMemberIdAndClientMessageId(10L, 1L, "attempt"))
                .thenReturn(Optional.of(existing));
        Supplier<ChatImagePayload> upload = mock(Supplier.class);
        var response = chats.sendImage(owner, 10L, "", "attempt", upload);
        assertThat(response.getImageUrl()).isEqualTo("/api/chat/images/30");
        verifyNoInteractions(upload);
        verify(messages, never()).save(any());
    }

    @Test
    void sendsImageWithoutCaptionAndUpdatesTheSameUnreadLedger() {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(messages.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var response = chats.sendImage(owner, 10L, "", "attempt",
                () -> new ChatImagePayload("users/1/chat/10/image.bin", "image/png", 40, 30, 100, "C:\\fakepath\\가게 사진.PNG"));
        assertThat(response.getContent()).isEmpty();
        assertThat(response.getImageWidth()).isEqualTo(40);
        assertThat(response.getImageOriginalFilename()).isEqualTo("가게 사진.PNG");
        assertThat(room.getLastMessagePreview()).isEqualTo("사진");
        assertThat(room.getAdminUnread()).isEqualTo(1);
    }
}
