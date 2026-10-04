package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatReportContextResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.SliceImpl;
import java.util.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatImageAccessTest {
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final ChatService chats = new ChatService(rooms, messages, mock(MemberRepository.class), stores);
    private final FileStorageService storage = mock(FileStorageService.class);
    private final ChatModerationService moderation = mock(ChatModerationService.class);
    private final ChatImageCipher cipher = new ChatImageCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final ChatReportEvidenceRepository evidence = mock(ChatReportEvidenceRepository.class);
    private final ChatReportAuditService audit = mock(ChatReportAuditService.class);
    private final ChatImageService images = new ChatImageService(chats, messages, storage, cipher, moderation, evidence, audit);
    private final Member customer = Member.builder().id(1L).role(Role.USER).build();
    private final Member admin = Member.builder().id(9L).role(Role.ADMIN).build();
    private final ChatRoom room = ChatRoom.builder().id(10L).member(customer).storeId(5L).type(ChatRoom.RoomType.STORE).build();

    @Test void adminCannotReadUnreportedStorePhotoThroughParticipantApi() {
        var photo = photo();
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        assertThatThrownBy(() -> images.read(admin, 33L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(storage);
    }

    @Test void reportAllowsOnlyItsReturnedContextAndRejectsUnrelatedMessageBeforeS3() {
        var photo = photo();
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(ChatMessageResponse.from(photo)).recentMessages(List.of()).build());
        assertThatThrownBy(() -> images.readForReport(customer, 20L, 33L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(moderation);
        assertThatThrownBy(() -> images.readForReport(admin, 20L, 34L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(storage);
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        byte[] plaintext = {1, 2, 3};
        when(storage.readEncryptedChatImage(photo.getImageKey(), "users/1/chat/10"))
                .thenReturn(cipher.encrypt(plaintext, "users/1/chat/10"));
        assertThat(images.readForReport(admin, 20L, 33L).bytes()).isEqualTo(plaintext);
    }

    @Test void retractedPhotoIsUnavailableToParticipantsButRetainedForReportReview() {
        var photo = photo();
        photo.retract(java.time.LocalDateTime.now(), 1);
        assertThat(ChatMessageResponse.from(photo).getImageOriginalFilename()).isNull();
        assertThat(ChatMessageResponse.forReport(photo).getImageOriginalFilename()).isEqualTo("원본 사진.png");
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        assertThatThrownBy(() -> images.read(customer, 33L)).isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(org.springframework.http.HttpStatus.NOT_FOUND);
        verifyNoInteractions(storage);
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(ChatMessageResponse.forReport(photo)).recentMessages(List.of()).build());
        byte[] plaintext = {1, 2, 3};
        when(storage.readEncryptedChatImage(photo.getImageKey(), "users/1/chat/10"))
                .thenReturn(cipher.encrypt(plaintext, "users/1/chat/10"));
        var original = images.readForReport(admin, 20L, 33L);
        assertThat(original.bytes()).isEqualTo(plaintext);
        assertThat(original.originalFilename()).isEqualTo("원본 사진.png");
    }

    @Test void blockedStoreConversationRejectsPhotoBeforeUpload() {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(stores.findById(5L)).thenReturn(Optional.of(Store.builder().id(5L).build()));
        room.setBlocked(kr.it.reserve.chat.entity.SenderRole.MEMBER, true, java.time.LocalDateTime.now());
        Supplier<kr.it.reserve.chat.dto.ChatImagePayload> upload = mock(Supplier.class);
        assertThatThrownBy(() -> chats.sendImage(customer, 10L, "", "photo-id", upload)).isInstanceOf(ChatException.class);
        verifyNoInteractions(upload);
    }

    @Test void reportedPhotoRemainsReadableFromTheSnapshotAfterOrdinaryContentExpires() {
        var photo = photo();
        var captured = kr.it.reserve.chat.entity.ChatReportEvidence.capture(20L, photo, java.time.LocalDateTime.now());
        photo.purge(java.time.LocalDateTime.now(), 2);
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(ChatMessageResponse.forEvidence(captured)).recentMessages(List.of()).build());
        when(evidence.findByReportIdAndMessageId(20L, 33L)).thenReturn(Optional.of(captured));
        byte[] plaintext = {1, 2, 3};
        when(storage.readEncryptedChatImage(captured.getImageKey(), "users/1/chat/10"))
                .thenReturn(cipher.encrypt(plaintext, "users/1/chat/10"));

        assertThat(images.readForReport(admin, 20L, 33L).bytes()).isEqualTo(plaintext);
        verifyNoInteractions(messages);
        verify(audit).recordAccess(admin, 20L, 33L, kr.it.reserve.chat.entity.ChatReportAccessAudit.Action.IMAGE);
        assertThat(photo.getImageKey()).isNull();
        assertThat(photo.getImageOriginalFilename()).isNull();
        assertThat(ChatMessageResponse.from(photo).getImageOriginalFilename()).isNull();
        assertThat(ChatMessageResponse.forEvidence(captured).getImageOriginalFilename()).isEqualTo("원본 사진.png");
    }

    @Test void failedPhotoAccessAuditDoesNotReturnTheOriginal() {
        var captured = kr.it.reserve.chat.entity.ChatReportEvidence.capture(20L, photo(), java.time.LocalDateTime.now());
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(ChatMessageResponse.forEvidence(captured)).recentMessages(List.of()).build());
        when(evidence.findByReportIdAndMessageId(20L, 33L)).thenReturn(Optional.of(captured));
        when(storage.readEncryptedChatImage(captured.getImageKey(), "users/1/chat/10"))
                .thenReturn(cipher.encrypt(new byte[] {1}, "users/1/chat/10"));
        doThrow(new IllegalStateException("audit unavailable")).when(audit)
                .recordAccess(admin, 20L, 33L, kr.it.reserve.chat.entity.ChatReportAccessAudit.Action.IMAGE);

        assertThatThrownBy(() -> images.readForReport(admin, 20L, 33L)).hasMessageContaining("audit unavailable");
    }

    @Test void supportGetDoesNotCreateRoomOrClearUnread() {
        var support = ChatRoom.builder().id(10L).member(customer).type(ChatRoom.RoomType.SUPPORT).memberUnread(3).build();
        when(rooms.findByMemberIdAndType(1L, ChatRoom.RoomType.SUPPORT)).thenReturn(Optional.of(support));
        when(messages.findByRoomIdOrderByIdDesc(eq(10L), any())).thenReturn(new SliceImpl<>(List.of()));
        assertThat(chats.getSupportConversation(customer).getRoomId()).isEqualTo(10L);
        assertThat(support.getMemberUnread()).isEqualTo(3);
        verify(rooms, never()).findByIdForUpdate(any());
        verify(rooms, never()).save(any());
    }

    private ChatMessage photo() {
        return ChatMessage.builder().id(33L).room(room).senderMemberId(1L).senderRole(kr.it.reserve.chat.entity.SenderRole.MEMBER).content("")
                .imageKey("users/1/chat/10/photo.bin").imageContentType("image/png").imageOriginalFilename("원본 사진.png").build();
    }
}
