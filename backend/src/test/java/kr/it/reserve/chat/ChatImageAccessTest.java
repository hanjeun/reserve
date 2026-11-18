package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatAttachmentPayload;
import kr.it.reserve.chat.dto.ChatReportContextResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.entity.ChatReportEvidence;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.ChatDocumentValidator;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.global.error.FileException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.SliceImpl;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatImageAccessTest {
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final ChatMessageHiddenRepository hidden = mock(ChatMessageHiddenRepository.class);
    private final ChatService chats = new ChatService(rooms, messages, mock(MemberRepository.class), stores, hidden);
    private final FileStorageService storage = mock(FileStorageService.class);
    private final ChatModerationService moderation = mock(ChatModerationService.class);
    private final ChatImageCipher cipher = new ChatImageCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final ChatReportEvidenceRepository evidence = mock(ChatReportEvidenceRepository.class);
    private final ChatReportAuditService audit = mock(ChatReportAuditService.class);
    private final ChatImageService images = new ChatImageService(chats, messages, storage, cipher, moderation, evidence, audit);
    private final Member customer = Member.builder().id(1L).role(Role.USER).build();
    private final Member admin = Member.builder().id(9L).role(Role.ADMIN).build();
    private final ChatRoom room = ChatRoom.builder().id(10L).member(customer).storeId(5L).type(ChatRoom.RoomType.STORE).build();

    @Test void privatelyDeletedPhotoIsNotReadableByTheDeletingAccountBeforeAnyStorageRequest() {
        when(messages.findById(33L)).thenReturn(Optional.of(photo()));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        when(hidden.existsByMemberIdAndMessageId(customer.getId(), 33L)).thenReturn(true);
        assertThatThrownBy(() -> images.read(customer, 33L)).isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(org.springframework.http.HttpStatus.NOT_FOUND);
        assertThatThrownBy(() -> images.thumbnail(customer, 33L)).isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(org.springframework.http.HttpStatus.NOT_FOUND);
        verifyNoInteractions(storage);
    }

    @Test void theThumbnailUsesTheScopedCompanionWithoutLoadingTheOriginal() {
        var photo = photo();
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        byte[] preview = {(byte) 0x89, 1, 2, 3};
        when(storage.readEncryptedChatThumbnail(eq(photo.getImageKey()), eq("users/1/chat/10"), any()))
                .thenReturn(cipher.encrypt(preview, "users/1/chat/10/thumbnail"));

        var result = images.thumbnail(customer, 33L);

        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.bytes()).isEqualTo(preview);
        assertThat(ChatMessageResponse.from(photo).getImageThumbnailUrl()).isEqualTo("/api/chat/images/33/thumbnail");
        verify(storage, never()).readEncryptedChatImage(anyString(), anyString());
    }

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
        Supplier<ChatAttachmentPayload> upload = mock(Supplier.class);
        assertThatThrownBy(() -> chats.sendAttachment(customer, 10L, "", "photo-id", upload)).isInstanceOf(ChatException.class);
        verifyNoInteractions(upload);
    }

    @Test void documentUsesTheChatSendTransactionAndTheSameRequestDoesNotWriteStorageTwice() {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(stores.findById(5L)).thenReturn(Optional.of(Store.builder().id(5L).build()));
        String prefix = "users/1/chat/10/documents";
        byte[] text = "문의 자료".getBytes(StandardCharsets.UTF_8);
        when(storage.storeEncryptedChatDocument(any(), eq(prefix))).thenAnswer(invocation -> {
            byte[] encrypted = invocation.getArgument(0, byte[].class);
            assertThat(cipher.decrypt(encrypted, prefix)).containsExactly(text);
            assertThatThrownBy(() -> cipher.decrypt(encrypted, "users/1/chat/10")).isInstanceOf(IllegalStateException.class);
            return prefix + "/opaque.bin";
        });
        when(messages.save(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var request = new kr.it.reserve.chat.dto.SendChatImageRequest();
        request.setClientMessageId("document-1");
        var upload = new MockMultipartFile("file", "자료.TXT", "application/octet-stream", text);

        assertThat(images.sendDocument(customer, 10L, upload, request).getFileName()).isEqualTo("자료.TXT");
        var saved = org.mockito.ArgumentCaptor.forClass(ChatMessage.class);
        verify(messages).save(saved.capture());
        when(messages.findByRoomIdAndSenderMemberIdAndClientMessageId(10L, 1L, "document-1")).thenReturn(Optional.of(saved.getValue()));
        assertThat(images.sendDocument(customer, 10L, upload, request).getImageUrl()).isNull();
        assertThat(room.getLastMessagePreview()).isEqualTo("파일");
        verify(storage, times(1)).storeEncryptedChatDocument(any(), eq(prefix));
    }

    @Test void documentDownloadUsesParticipantScopeAndCannotEnterInlinePhotoRoutes() {
        var document = document();
        when(messages.findById(35L)).thenReturn(Optional.of(document));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        var dto = ChatMessageResponse.from(document);
        assertThat(dto.getFileUrl()).isEqualTo("/api/chat/files/35");
        assertThat(dto.getImageUrl()).isNull();
        assertThat(dto.getImageThumbnailUrl()).isNull();

        assertThatThrownBy(() -> images.readDocument(admin, 35L)).isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> images.read(customer, 35L)).isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        assertThatThrownBy(() -> images.thumbnail(customer, 35L)).isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        when(hidden.existsByMemberIdAndMessageId(customer.getId(), 35L)).thenReturn(true);
        assertThatThrownBy(() -> images.readDocument(customer, 35L)).isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        verifyNoInteractions(storage);

        when(hidden.existsByMemberIdAndMessageId(customer.getId(), 35L)).thenReturn(false);
        String prefix = "users/1/chat/10/documents";
        byte[] bytes = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        when(storage.readEncryptedChatDocument(document.getImageKey(), prefix)).thenReturn(cipher.encrypt(bytes, prefix));
        assertThat(images.readDocument(customer, 35L).bytes()).isEqualTo(bytes);

        document.retract(LocalDateTime.now(), 1);
        assertThat(ChatMessageResponse.from(document).getFileUrl()).isNull();
        assertThatThrownBy(() -> images.readDocument(customer, 35L)).isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        verify(storage, times(1)).readEncryptedChatDocument(document.getImageKey(), prefix);
    }

    @Test void aReportedDocumentIsAuditedAndRetainedAfterOrdinaryExpiration() {
        var document = document();
        var snapshot = ChatReportEvidence.capture(20L, document, LocalDateTime.now());
        document.purge(LocalDateTime.now(), 2);
        var dto = ChatMessageResponse.forEvidence(snapshot);
        assertThat(dto.getFileUrl()).isEqualTo("/api/admin/chat/reports/20/files/35");
        assertThat(ChatMessageResponse.from(document).getFileUrl()).isNull();
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(dto).recentMessages(List.of()).build());
        when(evidence.findByReportIdAndMessageId(20L, 35L)).thenReturn(Optional.of(snapshot));
        assertThatThrownBy(() -> images.readForReport(admin, 20L, 35L)).isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> images.readDocumentForReport(admin, 20L, 36L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(storage);

        String prefix = "users/1/chat/10/documents";
        byte[] bytes = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        when(storage.readEncryptedChatDocument(snapshot.getImageKey(), prefix)).thenReturn(cipher.encrypt(bytes, prefix));
        assertThat(images.readDocumentForReport(admin, 20L, 35L).bytes()).isEqualTo(bytes);
        verify(audit).recordAccess(admin, 20L, 35L, ChatReportAccessAudit.Action.IMAGE);
        verifyNoInteractions(messages);
    }

    @Test void documentValidationUsesContentAndBoundedReads() {
        assertThat(ChatDocumentValidator.inspect(new MockMultipartFile("file", "readme.PDF", "application/octet-stream",
                "%PDF-2.0\n".getBytes(StandardCharsets.US_ASCII))).contentType()).isEqualTo("application/pdf");
        assertThatThrownBy(() -> ChatDocumentValidator.inspect(new MockMultipartFile("file", "wrong.pdf", "application/pdf",
                "잘못된 형식".getBytes(StandardCharsets.UTF_8)))).isInstanceOf(FileException.class);
        assertThatThrownBy(() -> ChatDocumentValidator.inspect(new MockMultipartFile("file", "invalid.txt", "text/plain",
                new byte[] { (byte) 0xff }))).isInstanceOf(FileException.class);
        assertThatThrownBy(() -> ChatDocumentValidator.inspect(new MockMultipartFile("file", "other.zip", "application/zip",
                new byte[] {1, 2}))).isInstanceOf(FileException.class);
        var oversized = new MockMultipartFile("file", "too-big.txt", "text/plain", new byte[ChatDocumentValidator.MAX_BYTES + 1]) {
            @Override public long getSize() { return 1L; }
        };
        assertThatThrownBy(() -> ChatDocumentValidator.inspect(oversized)).isInstanceOf(FileException.class)
                .extracting("status").isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }

    private ChatMessage document() {
        return ChatMessage.builder().id(35L).room(room).senderRole(kr.it.reserve.chat.entity.SenderRole.MEMBER)
                .senderMemberId(customer.getId()).content("").imageKey("users/1/chat/10/documents/opaque.bin")
                .imageContentType("application/pdf").imageOriginalFilename("자료.pdf").imageBytes(9).build();
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

    @Test void browserCacheChecksNeverReadStorageAndRepeatCurrentVisibilityChecks() {
        var photo = photo();
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        when(rooms.findById(10L)).thenReturn(Optional.of(room));
        images.assertReadable(customer, 33L);
        verifyNoInteractions(storage);
        when(hidden.existsByMemberIdAndMessageId(customer.getId(), 33L)).thenReturn(true);
        assertThatThrownBy(() -> images.assertReadable(customer, 33L)).isInstanceOf(ChatException.class);
        when(hidden.existsByMemberIdAndMessageId(customer.getId(), 33L)).thenReturn(false);
        photo.retract(java.time.LocalDateTime.now(), 1);
        assertThatThrownBy(() -> images.assertReadable(customer, 33L)).isInstanceOf(ChatException.class);
        verifyNoInteractions(storage);
    }

    @Test void cachedReportBytesStillRequireAnAccessAuditOnEveryRead() {
        var photo = photo();
        when(moderation.contextForImage(admin, 20L)).thenReturn(ChatReportContextResponse.builder()
                .reportedMessage(ChatMessageResponse.from(photo)).recentMessages(List.of()).build());
        when(messages.findById(33L)).thenReturn(Optional.of(photo));
        when(storage.readEncryptedChatImage(photo.getImageKey(), "users/1/chat/10"))
                .thenReturn(cipher.encrypt(new byte[] {1}, "users/1/chat/10"));
        images.readForReport(admin, 20L, 33L);
        images.readForReport(admin, 20L, 33L);
        verify(audit, times(2)).recordAccess(admin, 20L, 33L, ChatReportAccessAudit.Action.IMAGE);
    }

    private ChatMessage photo() {
        return ChatMessage.builder().id(33L).room(room).senderMemberId(1L).senderRole(kr.it.reserve.chat.entity.SenderRole.MEMBER).content("")
                .imageKey("users/1/chat/10/photo.bin").imageContentType("image/png").imageOriginalFilename("원본 사진.png").build();
    }
}
