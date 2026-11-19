package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatAttachmentPayload;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.SendChatImageRequest;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.repository.ChatReportEvidenceRepository;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.ChatDocumentValidator;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.file.util.JpegOrientation;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.concurrent.Semaphore;
import java.util.Objects;
import java.util.Arrays;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class ChatImageService {
    private final ChatService chatService;
    private final ChatMessageRepository messages;
    private final FileStorageService storage;
    private final ChatImageCipher cipher;
    private final ChatModerationService moderation;
    private final ChatReportEvidenceRepository evidence;
    private final ChatReportAuditService audit;
    // 압축 이미지와 암호문을 동시에 보유하는 작업 수를 제한한다. 대기열은 만들지 않는다.
    private final Semaphore transfers = new Semaphore(2);

    public boolean isEnabled() { return cipher.isEnabled(); }

    public ChatMessageResponse send(Member member, Long roomId, MultipartFile file, SendChatImageRequest request) {
        cipher.requireKey();
        return bounded(() -> chatService.sendAttachment(member, roomId, request.getContent(), request.getClientMessageId(), () -> {
            var image = ImageFileValidator.inspect(file);
            String prefix = FileStoragePaths.chatImage(member.getId(), roomId);
            int orientation = JpegOrientation.read(image.bytes());
            byte[] thumbnail = ChatImageThumbnail.create(image.bytes(), orientation);
            String key = storage.storeEncryptedChatImage(cipher.encrypt(image.bytes(), prefix),
                    cipher.encrypt(thumbnail, thumbnailContext(prefix)), prefix);
            int width = orientation >= 5 ? image.height() : image.width();
            int height = orientation >= 5 ? image.width() : image.height();
            return new ChatAttachmentPayload(key, image.contentType(), width, height, image.bytes().length,
                    file.getOriginalFilename());
        }));
    }

    public ChatMessageResponse sendDocument(Member member, Long roomId, MultipartFile file, SendChatImageRequest request) {
        cipher.requireKey();
        return bounded(() -> chatService.sendAttachment(member, roomId, request.getContent(), request.getClientMessageId(), () -> {
            var document = ChatDocumentValidator.inspect(file);
            String prefix = FileStoragePaths.chatDocument(member.getId(), roomId);
            String key = storage.storeEncryptedChatDocument(cipher.encrypt(document.bytes(), prefix), prefix);
            return new ChatAttachmentPayload(key, document.contentType(), null, null, document.bytes().length, file.getOriginalFilename());
        }));
    }

    @Transactional(readOnly = true)
    public ImageContent read(Member member, Long messageId) {
        return readContent(readableAttachment(member, messageId, false));
    }

    @Transactional(readOnly = true)
    public ImageContent readDocument(Member member, Long messageId) {
        return readContent(readableAttachment(member, messageId, true));
    }

    @Transactional(readOnly = true)
    public ImageContent thumbnail(Member member, Long messageId) {
        ChatMessage message = readableAttachment(member, messageId, false);
        String prefix = FileStoragePaths.chatImage(message.getSenderMemberId(), message.getRoom().getId());
        String context = thumbnailContext(prefix);
        return bounded(() -> {
            byte[] thumbnail = cipher.decrypt(storage.readEncryptedChatThumbnail(message.getImageKey(), prefix, () -> {
                byte[] original = cipher.decrypt(storage.readEncryptedChatImage(message.getImageKey(), prefix), prefix);
                return cipher.encrypt(ChatImageThumbnail.create(original, JpegOrientation.read(original)), context);
            }), context);
            String type = (thumbnail[0] & 0xff) == 0x89 ? "image/png" : "image/jpeg";
            return new ImageContent(thumbnail, type);
        });
    }

    private static String thumbnailContext(String prefix) {
        return prefix + "/thumbnail";
    }

    @Transactional(readOnly = true)
    public void assertReadable(Member member, Long messageId) {
        cipher.requireKey();
        readableAttachment(member, messageId, false);
    }

    private ChatMessage readableAttachment(Member member, Long messageId, boolean document) {
        var message = messages.findById(messageId)
                .orElseThrow(() -> attachmentNotFound(document));
        chatService.assertImageReader(message.getRoom().getId(), member);
        if (message.isRetracted() || message.isPurged() || message.getImageKey() == null
                || document != ChatDocumentValidator.supports(message.getImageContentType())
                || chatService.isMessageHidden(member.getId(), messageId)) {
            throw attachmentNotFound(document);
        }
        return message;
    }

    /** 관리자 첨부 조회는 해당 신고에 포함된 증거로 제한한다. */
    @Transactional(readOnly = true)
    public ImageContent readForReport(Member admin, Long reportId, Long messageId) {
        return readReportAttachment(admin, reportId, messageId, false);
    }

    @Transactional(readOnly = true)
    public ImageContent readDocumentForReport(Member admin, Long reportId, Long messageId) {
        return readReportAttachment(admin, reportId, messageId, true);
    }

    private ImageContent readReportAttachment(Member admin, Long reportId, Long messageId, boolean document) {
        if (admin.getRole() != Role.ADMIN) throw new ChatException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
        var context = moderation.contextForImage(admin, reportId);
        boolean reported = context.getReportedMessage() != null && messageId.equals(context.getReportedMessage().getId());
        boolean recent = context.getRecentMessages().stream().anyMatch(message -> messageId.equals(message.getId()));
        if (!reported && !recent) throw new ChatException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
        var snapshot = evidence.findByReportIdAndMessageId(reportId, messageId);
        ImageContent content;
        if (snapshot.isPresent()) {
            var item = snapshot.get();
            if (item.getImageKey() == null || document != ChatDocumentValidator.supports(item.getImageContentType())) {
                throw attachmentNotFound(document);
            }
            content = readContent(item.getImageKey(), item.getImageContentType(), item.getImageOriginalFilename(),
                    item.getSenderMemberId(), item.getRoomId());
        } else {
            var item = messages.findById(messageId).orElseThrow(() -> attachmentNotFound(document));
            if (document != ChatDocumentValidator.supports(item.getImageContentType())) throw attachmentNotFound(document);
            content = readContent(item);
        }
        // 기존 감사 유형은 대화 첨부 조회에도 사용한다.
        audit.recordAccess(admin, reportId, messageId, ChatReportAccessAudit.Action.IMAGE);
        return content;
    }

    private ImageContent readContent(ChatMessage message) {
        return readContent(message.getImageKey(), message.getImageContentType(), message.getImageOriginalFilename(),
                message.getSenderMemberId(), message.getRoom().getId());
    }

    private ImageContent readContent(String key, String type, String filename, Long memberId, Long roomId) {
        boolean document = ChatDocumentValidator.supports(type);
        if (key == null) throw attachmentNotFound(document);
        String prefix = document ? FileStoragePaths.chatDocument(memberId, roomId) : FileStoragePaths.chatImage(memberId, roomId);
        return bounded(() -> {
            byte[] encrypted = document ? storage.readEncryptedChatDocument(key, prefix) : storage.readEncryptedChatImage(key, prefix);
            return new ImageContent(cipher.decrypt(encrypted, prefix), type, filename);
        });
    }

    private static ChatException attachmentNotFound(boolean document) {
        return new ChatException(document ? "첨부 파일을 찾을 수 없어요." : "사진을 찾을 수 없어요.", HttpStatus.NOT_FOUND);
    }

    private <T> T bounded(Supplier<T> transfer) {
        if (!transfers.tryAcquire()) throw new ChatException("잠시 후 첨부를 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        try { return transfer.get(); }
        finally { transfers.release(); }
    }

    public record ImageContent(byte[] bytes, String contentType, String originalFilename) {
        public ImageContent(byte[] bytes, String contentType) { this(bytes, contentType, null); }

        @Override
        public boolean equals(Object other) {
            return this == other || other instanceof ImageContent(var imageBytes, var imageContentType, var imageOriginalFilename)
                    && Arrays.equals(bytes, imageBytes)
                    && Objects.equals(contentType, imageContentType)
                    && Objects.equals(originalFilename, imageOriginalFilename);
        }

        @Override
        public int hashCode() {
            return 31 * Arrays.hashCode(bytes) + Objects.hash(contentType, originalFilename);
        }

        @Override
        public String toString() {
            return "ImageContent[byteCount=" + (bytes == null ? 0 : bytes.length) + ", contentType=" + contentType + "]";
        }
    }
}
