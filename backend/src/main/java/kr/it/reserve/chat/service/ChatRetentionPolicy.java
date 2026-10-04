package kr.it.reserve.chat.service;

import kr.it.reserve.chat.entity.ChatReport;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Set;

/** 실제 고지와 유예가 확인되기 전에는 어떤 호출 경로에서도 파기하지 않는다. */
@Component
@Slf4j
public class ChatRetentionPolicy {
    public static final int MESSAGE_RETENTION_DAYS = 90;
    public static final int NOTICE_GRACE_DAYS = 30;
    public static final Set<ChatReport.Status> TERMINAL_STATUSES = Set.of(
            ChatReport.Status.RESOLVED, ChatReport.Status.DISMISSED);
    public static final Set<ChatReport.Status> ACTIVE_STATUSES = Set.of(
            ChatReport.Status.OPEN, ChatReport.Status.REVIEWING);
    public static final Set<ChatReport.RetentionCategory> ORIGINAL_HOLD_CATEGORIES = Set.of(
            ChatReport.RetentionCategory.UNCLASSIFIED,
            ChatReport.RetentionCategory.CONSUMER_DISPUTE,
            ChatReport.RetentionCategory.CONTRACT_PAYMENT);

    private final boolean enabled;
    private final LocalDateTime noticePublishedAt;
    private final int accessAuditYears;

    public ChatRetentionPolicy(@Value("${chat.retention.enabled:false}") boolean enabled,
                               @Value("${chat.retention.notice-published-at:}") String notice,
                               @Value("${chat.retention.access-audit-years:1}") String auditYears) {
        this.enabled = enabled;
        this.noticePublishedAt = parseNotice(notice);
        this.accessAuditYears = parseAuditYears(auditYears);
    }

    public boolean isActive(LocalDateTime now) {
        return enabled && noticePublishedAt != null && accessAuditYears > 0 && now != null
                && !now.isBefore(noticePublishedAt.plusDays(NOTICE_GRACE_DAYS));
    }

    public boolean isEnabled() {
        return enabled && accessAuditYears > 0;
    }

    /** 미래 날짜나 잘못된 환경값을 실제 게시 이력처럼 공개하지 않는다. */
    public OffsetDateTime publishedAt(LocalDateTime now) {
        return noticePublishedAt == null || now == null || noticePublishedAt.isAfter(now) ? null
                : noticePublishedAt.atOffset(ZoneOffset.UTC);
    }

    public OffsetDateTime effectiveAt(LocalDateTime now) {
        OffsetDateTime published = publishedAt(now);
        return published == null ? null : published.plusDays(NOTICE_GRACE_DAYS);
    }

    public boolean canPurgeMessage(LocalDateTime createdAt, LocalDateTime now) {
        return isActive(now) && createdAt != null && createdAt.isBefore(messageCutoff(now));
    }

    public LocalDateTime messageCutoff(LocalDateTime now) {
        return now.minusDays(MESSAGE_RETENTION_DAYS);
    }

    public LocalDateTime auditCutoff(LocalDateTime now) {
        return now.minusYears(accessAuditYears);
    }

    public boolean holdsAccessAudit(ChatReport report) {
        return report != null && (report.isRetentionHold() || !report.isTerminal()
                || report.getRetentionCategory() == null
                || report.getRetentionCategory() == ChatReport.RetentionCategory.UNCLASSIFIED);
    }

    public LocalDateTime reportExpiresAt(ChatReport report) {
        if (holdsAccessAudit(report) || report == null || report.getReviewedAt() == null) return null;
        LocalDateTime until = switch (report.getRetentionCategory()) {
            case GENERAL_REPORT -> report.getReviewedAt().plusYears(1);
            case CONSUMER_DISPUTE -> report.getReviewedAt().plusYears(3);
            case CONTRACT_PAYMENT -> report.getRetentionBasisAt() == null ? null
                    : report.getRetentionBasisAt().plusYears(5).plusDays(1);
            case UNCLASSIFIED -> null;
        };
        if (until != null && report.getMinimumRetentionUntil() != null
                && report.getMinimumRetentionUntil().isAfter(until)) {
            until = report.getMinimumRetentionUntil();
        }
        return until;
    }

    public boolean canPurgeReport(ChatReport report, LocalDateTime now) {
        if (!isActive(now)) return false;
        LocalDateTime until = reportExpiresAt(report);
        return until != null && until.isBefore(now);
    }

    private LocalDateTime parseNotice(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            LocalDateTime parsed = OffsetDateTime.parse(value.trim()).withOffsetSameInstant(ZoneOffset.UTC)
                    .toLocalDateTime();
            if (parsed.getYear() < 2000 || parsed.getYear() > 9999
                    || parsed.isAfter(LocalDateTime.now(Clock.systemUTC()))) {
                log.warn("Chat retention disabled: publication timestamp is outside the valid past range");
                return null;
            }
            return parsed;
        } catch (DateTimeParseException invalid) {
            log.warn("Chat retention disabled: invalid publication timestamp");
            return null;
        }
    }

    private int parseAuditYears(String value) {
        if ("1".equals(value)) return 1;
        if ("2".equals(value)) return 2;
        log.warn("Chat retention disabled: invalid access audit period");
        return 0;
    }
}
