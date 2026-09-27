package kr.it.reserve.chat.service;

import kr.it.reserve.chat.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatRetentionService {
    public static final int RETENTION_DAYS = 90;
    private final ChatRoomRepository rooms;
    private final ChatMessageRepository messages;
    private final ChatReportRepository reports;
    private final ChatReportEvidenceRepository evidence;
    private final FileDeletionOutboxService deletions;

    /** 신고와 같은 방 잠금 순서. 스냅샷/삭제 의도/마스킹은 한 트랜잭션이다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void purge(Long roomId, Long messageId, LocalDateTime now) {
        var room = rooms.findByIdForUpdate(roomId).orElse(null);
        if (room == null) return;
        var item = messages.findByIdAndRoomId(messageId, roomId).orElse(null);
        if (item == null || item.isPurged() || item.getCreatedAt() == null
                || !item.getCreatedAt().isBefore(now.minusDays(RETENTION_DAYS))) return;
        if (reports.countLegacyEvidenceHolds(roomId) > 0) return;
        String imageKey = item.getImageKey();
        if (imageKey != null && !evidence.existsByImageKey(imageKey))
            deletions.enqueue(imageKey, "CHAT_RETENTION", item.getId());
        item.purge(now, room.nextRetractionRevision());
        if (messages.findLatestByRoomIds(List.of(roomId)).stream().anyMatch(latest -> item.getId().equals(latest.getId())))
            room.replaceLastMessagePreview("보존 기간이 지난 메시지입니다.");
        log.info("Chat content expired: roomId={}, messageId={}", roomId, messageId);
    }
}
