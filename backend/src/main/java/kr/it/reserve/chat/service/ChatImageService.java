package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatImagePayload;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.SendChatImageRequest;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.repository.ChatReportEvidenceRepository;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.concurrent.Semaphore;
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
        return bounded(() -> chatService.sendImage(member, roomId, request.getContent(), request.getClientMessageId(), () -> {
            var image = ImageFileValidator.inspect(file);
            String prefix = FileStoragePaths.chatImage(member.getId(), roomId);
            String key = storage.storeEncryptedChatImage(cipher.encrypt(image.bytes(), prefix), prefix);
            return new ChatImagePayload(key, image.contentType(), image.width(), image.height(), image.bytes().length);
        }));
    }

    @Transactional(readOnly = true)
    public ImageContent read(Member member, Long messageId) {
        var message = messages.findById(messageId)
                .orElseThrow(() -> new ChatException("사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        chatService.assertImageReader(message.getRoom().getId(), member);
        if (message.isRetracted()) throw new ChatException("사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        return readContent(message);
    }

    /** 관리자 가게 사진 접근은 신고 검토에 반환된 메시지로만 한정한다. */
    @Transactional(readOnly = true)
    public ImageContent readForReport(Member admin, Long reportId, Long messageId) {
        if (admin.getRole() != Role.ADMIN) throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        var context = moderation.contextForImage(admin, reportId);
        boolean reported = context.getReportedMessage() != null && messageId.equals(context.getReportedMessage().getId());
        boolean recent = context.getRecentMessages().stream().anyMatch(message -> messageId.equals(message.getId()));
        if (!reported && !recent) throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        var snapshot = evidence.findByReportIdAndMessageId(reportId, messageId);
        ImageContent content;
        if (snapshot.isPresent()) {
            var item = snapshot.get();
            if (item.getImageKey() == null) throw new ChatException("사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
            String prefix = FileStoragePaths.chatImage(item.getSenderMemberId(), item.getRoomId());
            content = bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedChatImage(item.getImageKey(), prefix), prefix), item.getImageContentType()));
        } else content = readContent(messages.findById(messageId)
                .orElseThrow(() -> new ChatException("사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND)));
        audit.record(admin, reportId, messageId, ChatReportAccessAudit.Action.IMAGE);
        return content;
    }

    private ImageContent readContent(ChatMessage message) {
        if (message.getImageKey() == null) throw new ChatException("사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        String prefix = FileStoragePaths.chatImage(message.getSenderMemberId(), message.getRoom().getId());
        return bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedChatImage(message.getImageKey(), prefix), prefix),
                message.getImageContentType()));
    }

    private <T> T bounded(Supplier<T> transfer) {
        if (!transfers.tryAcquire()) throw new ChatException("잠시 후 사진을 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        try { return transfer.get(); }
        finally { transfers.release(); }
    }

    public record ImageContent(byte[] bytes, String contentType) { }
}
