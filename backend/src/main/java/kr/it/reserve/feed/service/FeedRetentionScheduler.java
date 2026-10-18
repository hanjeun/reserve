package kr.it.reserve.feed.service;

import kr.it.reserve.feed.*;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.function.Function;

@Component @RequiredArgsConstructor @Slf4j
public class FeedRetentionScheduler {
    private final FeedPolicy policy;
    private final FeedPostRepository posts;
    private final FeedMediaRepository media;
    private final FeedReportRepository reports;
    private final FeedAuditRepository audits;
    private final FeedRetentionService retention;
    private final kr.it.reserve.promotion.repository.PromotionRepository promotions;

    @Scheduled(fixedDelayString = "${feed.retention.interval-ms:3600000}")
    public void run() {
        var now = FeedService.now(); var batch = PageRequest.of(0, 100);
        process("store-news", promotions.purgeNewsCandidates(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS), batch), id -> retention.purgeNews(id, now));
        process("post", posts.purgeCandidates(FeedPost.State.DELETED, now.minusDays(FeedPolicy.DELETE_GRACE_DAYS), batch), id -> retention.purgePost(id, now));
        process("orphan", media.orphanCandidates(now.minusHours(24), batch), id -> retention.purgeOrphan(id, now));
        process("report", reports.purgeCandidates(FeedReport.Status.RESOLVED, now.minusDays(FeedPolicy.REPORT_RETENTION_DAYS), batch), id -> retention.purgeReport(id, now));
        var auditCutoff = policy.accessAuditCutoff(now);
        if (auditCutoff != null) process("audit", audits.purgeCandidates(auditCutoff, batch), id -> retention.purgeAudit(id, now));
    }
    private void process(String kind, List<Long> ids, Function<Long, Boolean> action) {
        int purged = 0, failed = 0;
        for (Long id : ids) {
            try { if (action.apply(id)) purged++; }
            catch (RuntimeException exception) { failed++; log.warn("Feed retention item failed: kind={}, id={}, errorType={}", kind, id, exception.getClass().getSimpleName()); }
        }
        if (!ids.isEmpty()) log.info("Feed retention completed: kind={}, candidates={}, purged={}, failed={}", kind, ids.size(), purged, failed);
    }
}
