package kr.it.reserve.chat.service;

import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.chat.entity.ChatReport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;

/** 검증/정책 고지 후 명시적으로 활성화. 기본값은 운영 원문을 파기하지 않는다. */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChatRetentionScheduler {
    private final ChatMessageRepository messages;
    private final ChatRetentionService retention;
    private final ChatReportRepository reports;
    private final ChatReportAccessAuditRepository audits;
    private final ChatRetentionPolicy policy;

    @Scheduled(initialDelay = 600_000, fixedDelay = 600_000)
    @Transactional(readOnly = true)
    public void sweep() {
        LocalDateTime now = LocalDateTime.now(Clock.systemUTC());
        if (!policy.isActive(now)) return;
        var batch = PageRequest.of(0, 50);
        for (var report : reports.findRetentionCandidates(ChatRetentionPolicy.TERMINAL_STATUSES,
                ChatReport.RetentionCategory.GENERAL_REPORT, now.minusYears(1),
                ChatReport.RetentionCategory.CONSUMER_DISPUTE, now.minusYears(3),
                ChatReport.RetentionCategory.CONTRACT_PAYMENT, now.minusYears(5).minusDays(1), now, batch)) {
            try { retention.purgeReport(report.getRoomId(), report.getId(), now); }
            catch (RuntimeException failure) { log.warn("Chat report retention failed: reportId={}, errorType={}", report.getId(), failure.getClass().getSimpleName()); }
        }
        for (var item : messages.findExpired(policy.messageCutoff(now), ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now, batch)) {
            try { retention.purge(item.getRoomId(), item.getId(), now); }
            catch (RuntimeException failure) { log.warn("Chat retention failed: messageId={}, errorType={}", item.getId(), failure.getClass().getSimpleName()); }
        }
        for (var audit : audits.findRetentionCandidates(policy.auditCutoff(now),
                ChatRetentionPolicy.ACTIVE_STATUSES, ChatReport.RetentionCategory.UNCLASSIFIED, batch)) {
            try { retention.purgeAccessAudit(audit.getId(), now); }
            catch (RuntimeException failure) { log.warn("Chat access audit retention failed: auditId={}, errorType={}", audit.getId(), failure.getClass().getSimpleName()); }
        }
    }
}
