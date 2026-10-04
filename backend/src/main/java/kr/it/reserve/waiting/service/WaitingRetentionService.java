package kr.it.reserve.waiting.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.stream.Collectors;

/** 고지 이후부터 정리한다. 정상 가게의 진행 접수는 날짜 때문에 자동 종료·파기하지 않는다. */
@Service
@Slf4j
public class WaitingRetentionService {
    private final WaitingEntryRepository entries;
    private final boolean enabled;
    private final Instant noticePublishedAt;
    private final Clock clock;

    @Autowired
    public WaitingRetentionService(WaitingEntryRepository entries,
                                   @Value("${waiting.retention.enabled:true}") boolean enabled,
                                   @Value("${waiting.retention.notice-published-at:}") String notice) {
        this(entries, enabled, notice, Clock.systemUTC());
    }

    WaitingRetentionService(WaitingEntryRepository entries, boolean enabled, String notice, Clock clock) {
        this.entries = entries;
        this.enabled = enabled;
        this.clock = clock;
        this.noticePublishedAt = parseNotice(notice, clock.instant());
    }

    @Scheduled(fixedDelayString = "${waiting.retention.fixed-delay-ms:300000}", initialDelay = 30_000)
    @Transactional
    public void cleanFinishedEntries() {
        Instant now = clock.instant();
        if (!enabled || noticePublishedAt == null || now.isBefore(noticePublishedAt)) return;
        LocalDateTime dayStart = WaitingService.dayStartUtc(now.atZone(ServiceTime.ZONE).toLocalDate());
        LocalDateTime nowUtc = LocalDateTime.ofInstant(now, ZoneOffset.UTC);
        int closed = entries.cancelForDeletedStores(WaitingStatus.ACTIVE.stream().map(WaitingStatus::name).collect(Collectors.toSet()),
                WaitingStatus.CANCELLED.name(), nowUtc);
        LocalDateTime cutoff = nowUtc.minusDays(7);
        int minimized = entries.clearFinishedNames(WaitingStatus.TERMINAL, dayStart);
        int deleted = entries.deleteFinishedBefore(WaitingStatus.TERMINAL, cutoff);
        if (closed > 0 || minimized > 0 || deleted > 0) {
            log.info("Waiting retention completed: closed={}, minimized={}, deleted={}", closed, minimized, deleted);
        }
    }

    private static Instant parseNotice(String value, Instant now) {
        if (value == null || value.isBlank()) return null;
        try {
            OffsetDateTime parsed = OffsetDateTime.parse(value.trim());
            if (parsed.getYear() < 2000 || parsed.getYear() > 9999) return null;
            Instant published = parsed.toInstant();
            if (published.isAfter(now)) {
                log.warn("Waiting retention disabled: future publication timestamp");
                return null;
            }
            return published;
        } catch (DateTimeParseException invalid) {
            log.warn("Waiting retention disabled: invalid publication timestamp");
            return null;
        }
    }
}
