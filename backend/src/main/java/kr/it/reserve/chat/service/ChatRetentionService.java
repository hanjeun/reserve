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
    public static final int RETENTION_DAYS = ChatRetentionPolicy.MESSAGE_RETENTION_DAYS;
    private final ChatRoomRepository rooms;
    private final ChatMessageRepository messages;
    private final ChatReportRepository reports;
    private final ChatReportEvidenceRepository evidence;
    private final FileDeletionOutboxService deletions;
    private final ChatReportAccessAuditRepository audits;
    private final ChatRetentionPolicy policy;

    /** 신고와 같은 방 잠금 순서. 스냅샷/삭제 의도/마스킹은 한 트랜잭션이다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void purge(Long roomId, Long messageId, LocalDateTime now) {
        if (!policy.isActive(now)) return;
        var room = rooms.findByIdForUpdate(roomId).orElse(null);
        if (room == null) return;
        var item = messages.findByIdAndRoomId(messageId, roomId).orElse(null);
        if (item == null || item.isPurged() || !policy.canPurgeMessage(item.getCreatedAt(), now)) return;
        if (reports.countOriginalRetentionHolds(roomId, ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now) > 0) return;
        String imageKey = item.getImageKey();
        if (imageKey != null && !evidence.existsByImageKey(imageKey)
                && !messages.existsByImageKeyAndIdNot(imageKey, item.getId()))
            deletions.enqueue(imageKey, "CHAT_RETENTION", item.getId());
        item.purge(now, room.nextRetractionRevision());
        if (messages.findLatestByRoomIds(List.of(roomId)).stream().anyMatch(latest -> item.getId().equals(latest.getId())))
            room.replaceLastMessagePreview("보존 기간이 지난 메시지입니다.");
        log.info("Chat content expired: roomId={}, messageId={}", roomId, messageId);
    }

    /** 방→신고 잠금 아래에서 증거·신고·삭제 의도를 함께 처리한다. 최근 접근 기록은 남긴다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void purgeReport(Long roomId, Long reportId, LocalDateTime now) {
        if (!policy.isActive(now) || rooms.findByIdForUpdate(roomId).isEmpty()) return;
        var report = reports.findByIdForUpdate(reportId).orElse(null);
        if (report == null || !roomId.equals(report.getRoom().getId()) || !policy.canPurgeReport(report, now)) return;

        evidence.findByReportIdOrderByMessageIdAsc(reportId).stream()
                .map(snapshot -> snapshot.getImageKey())
                .filter(key -> key != null && !key.isBlank()).distinct()
                .filter(key -> !messages.existsByImageKey(key)
                        && !evidence.existsByImageKeyAndReportIdNot(key, reportId))
                .forEach(key -> deletions.enqueue(key, "CHAT_REPORT_RETENTION", reportId));
        evidence.deleteByReportId(reportId);
        audits.deleteExpiredByReportId(reportId, policy.auditCutoff(now));
        reports.delete(report);
        log.info("Chat report expired: roomId={}, reportId={}", roomId, reportId);
    }

    /** 신고가 이미 파기됐어도 접근 시각부터 법정 1/2년이 지난 기록만 없앤다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void purgeAccessAudit(Long auditId, LocalDateTime now) {
        if (!policy.isActive(now)) return;
        var initial = audits.findById(auditId).orElse(null);
        if (initial == null) return;
        var roomId = reports.findRoomIdById(initial.getReportId()).orElse(null);
        if (roomId != null) {
            if (rooms.findByIdForUpdate(roomId).isEmpty()) return;
            var report = reports.findByIdForUpdate(initial.getReportId()).orElse(null);
            if (policy.holdsAccessAudit(report)) return;
        }
        var audit = audits.findByIdForUpdate(auditId).orElse(null);
        if (audit == null || audit.getAccessedAt() == null
                || !audit.getAccessedAt().isBefore(policy.auditCutoff(now))) return;
        audits.delete(audit);
        log.info("Chat report access audit expired: auditId={}", auditId);
    }
}
