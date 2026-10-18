package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service @RequiredArgsConstructor @Slf4j
public class FeedCommentRetentionService {
    private final FeedPostRepository posts;
    private final FeedCommentRepository comments;
    private final FeedCommentReportRepository reports;
    private final ContentLikeRepository likes;
    private final PlatformTransactionManager transactionManager;
    private final EntityManager entityManager;
    private final FeedMediaRepository media;
    private final FeedReportImageRepository postEvidence;
    private final FeedCommentReportImageRepository commentEvidence;
    private final FileDeletionOutboxService deletion;

    @EventListener @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        comments.withdraw(event.memberId(), FeedService.now()); likes.withdraw(event.memberId());
    }
    @Scheduled(fixedDelayString = "${feed.retention.interval-ms:3600000}")
    public void run() {
        var transactions = new TransactionTemplate(transactionManager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        var now = FeedService.now(); var bounds = PageRequest.of(0, 100);
        var ids = transactions.execute(status -> comments.purgeCandidates(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS), bounds));
        if (ids != null) for (Long id : ids) {
            try { transactions.executeWithoutResult(status -> {
                var candidate = comments.findById(id).orElse(null);
                if (candidate == null) return;
                var owners = new java.util.TreeSet<Long>();
                if (candidate.getProfile() != null) owners.add(candidate.getProfile().getMember().getId());
                for (var image : media.findByComment_IdOrderByPositionAscIdAsc(id)) owners.add(image.getMember().getId());
                for (Long owner : owners) entityManager.find(Member.class, owner, LockModeType.PESSIMISTIC_WRITE);
                posts.findForUpdate(candidate.getPost().getId());
                var item = comments.findForUpdate(id).orElse(null);
                if (item != null) entityManager.refresh(item, LockModeType.PESSIMISTIC_WRITE);
                if (item == null || item.getState() != FeedComment.State.DELETED || item.getDeletedAt() == null || !item.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS))) return;
                var images = media.findByComment_IdOrderByPositionAscIdAsc(id);
                media.deleteAll(images); media.flush();
                for (var image : images) if (!postEvidence.existsByImageKey(image.getImageKey()) && !commentEvidence.existsByImageKey(image.getImageKey())) deletion.enqueue(image.getImageKey(), "feed_comment", id);
                if (comments.existsByParent_Id(id)) item.eraseOriginal(now); else comments.delete(item);
            }); } catch (RuntimeException error) { log.warn("Comment retention failed: id={}, errorType={}", id, error.getClass().getSimpleName()); }
        }
        var evidence = transactions.execute(status -> reports.purgeCandidates(now.minusDays(FeedPolicy.REPORT_RETENTION_DAYS), bounds));
        if (evidence != null) for (Long id : evidence) {
            try { transactions.executeWithoutResult(status -> {
                var candidates = commentEvidence.findByReport_IdOrderByPositionAscIdAsc(id);
                for (Long owner : candidates.stream().map(FeedCommentReportImage::getOwnerId).distinct().sorted().toList())
                    entityManager.find(Member.class, owner, LockModeType.PESSIMISTIC_WRITE);
                var item = reports.findForUpdate(id).orElse(null);
                if (item != null && item.getStatus() == FeedReport.Status.RESOLVED && !item.isHold() && item.getResolvedAt() != null
                    && item.getResolvedAt().isBefore(now.minusDays(FeedPolicy.REPORT_RETENTION_DAYS))) {
                    var images = commentEvidence.findByReport_IdOrderByPositionAscIdAsc(id);
                    commentEvidence.deleteAll(images); commentEvidence.flush();
                    for (String key : images.stream().map(FeedCommentReportImage::getImageKey).distinct().toList())
                        if (!media.existsByImageKey(key) && !postEvidence.existsByImageKey(key) && !commentEvidence.existsByImageKey(key)) deletion.enqueue(key, "feed_comment_report", id);
                    reports.delete(item);
                }
            }); } catch (RuntimeException error) { log.warn("Comment report retention failed: id={}, errorType={}", id, error.getClass().getSimpleName()); }
        }
    }
}
