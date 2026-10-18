package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;

/** DB 파기와 파일 삭제 의도를 같은 트랜잭션에 넣는다. 신고 원문/사진은 독립 보존한다. */
@Service @RequiredArgsConstructor
public class FeedRetentionService {
    private final FeedPolicy policy;
    private final FeedPostRepository posts;
    private final FeedMediaRepository media;
    private final FeedReportRepository reports;
    private final FeedReportImageRepository evidence;
    private final FeedAuditRepository audits;
    private final FileDeletionOutboxService deletion;
    private final EntityManager entityManager;
    private final PromotionRepository promotions;
    private final FeedCommentReportImageRepository commentEvidence;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean purgePost(Long id, LocalDateTime now) {
        FeedPost candidate = posts.findById(id).orElse(null);
        if (candidate == null) return false;
        Promotion news = candidate.getNewsPromotion();
        if (news != null && (news.getState() != Promotion.State.DELETED || news.getDeletedAt() == null
            || !news.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS)))) return false;
        lockPostOwners(candidate);
        if (news != null) entityManager.refresh(news, LockModeType.PESSIMISTIC_WRITE);
        // 후보 조회로 가져온 managed 상태를 현재 잠금 아래 다시 읽는다.
        entityManager.refresh(candidate, LockModeType.PESSIMISTIC_WRITE);
        if (candidate.getState() != FeedPost.State.DELETED || candidate.getDeletedAt() == null
                || !candidate.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS))) return false;
        if (news != null && (news.getState() != Promotion.State.DELETED || news.getDeletedAt() == null
                || !news.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS)))) return false;
        removePost(candidate);
        if (news != null) promotions.delete(news);
        return true;
    }

    /** 피드 노출이 꺼진 소식과 기존 소식도 같은 30일 원문 파기를 사용한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean purgeNews(Long id, LocalDateTime now) {
        Promotion candidate = promotions.findById(id).orElse(null); if (candidate == null) return false;
        if (candidate.getState() != Promotion.State.DELETED || candidate.getDeletedAt() == null
            || !candidate.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS))) return false;
        FeedPost linked = FeedPost.linkedTo(candidate);
        if (linked != null) lockPostOwners(linked); else lockOwner(candidate.getMember().getId());
        entityManager.refresh(candidate, LockModeType.PESSIMISTIC_WRITE);
        if (candidate.getState() != Promotion.State.DELETED || candidate.getDeletedAt() == null
                || !candidate.getDeletedAt().isBefore(now.minusDays(FeedPolicy.DELETE_GRACE_DAYS))) return false;
        FeedPost post = FeedPost.linkedTo(candidate);
        if (post != null) { entityManager.refresh(post, LockModeType.PESSIMISTIC_WRITE); removePost(post); }
        // 신고와 감사에는 FK 없는 독립 스냅샷이 남는다. SNS 자유글의 선택 링크는 FK SET NULL.
        promotions.delete(candidate); return true;
    }

    private void removePost(FeedPost candidate) {
        Long id = candidate.getId();
        List<FeedMedia> images = new ArrayList<>(media.findByPost_IdOrderByPositionAscIdAsc(id));
        images.addAll(media.findByComment_Post_IdOrderByIdAsc(id));
        for (FeedMedia image : images) {
            media.delete(image);
            if (!evidence.existsByImageKey(image.getImageKey()) && !commentEvidence.existsByImageKey(image.getImageKey())) deletion.enqueue(image.getImageKey(), "feed_post", id);
        }
        media.flush(); posts.delete(candidate); posts.flush();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean purgeOrphan(Long id, LocalDateTime now) {
        Long owner = media.ownerId(id).orElse(null); if (owner == null) return false;
        lockOwner(owner);
        FeedMedia image = media.findForUpdate(id).orElse(null);
        if (image == null || image.getPost() != null || image.getComment() != null) return false;
        LocalDateTime started = image.getDetachedAt() == null ? image.getCreatedAt() : image.getDetachedAt();
        if (!started.isBefore(now.minusHours(24))) return false;
        media.delete(image);
        if (!evidence.existsByImageKey(image.getImageKey()) && !commentEvidence.existsByImageKey(image.getImageKey())) deletion.enqueue(image.getImageKey(), "feed_orphan", id);
        return true;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean purgeReport(Long id, LocalDateTime now) {
        // 같은 암호문을 참조하는 다른 신고의 파기도 소유자 잠금으로 직렬화한다.
        // 일반 SELECT도 잠금 후 커밋된 참조를 읽도록 READ_COMMITTED를 사용한다.
        List<FeedReportImage> candidates = evidence.findByReport_IdOrderByPositionAscIdAsc(id);
        for (Long owner : candidates.stream().map(FeedReportImage::getOwnerId).distinct().sorted().toList()) lockOwner(owner);
        FeedReport report = reports.findForUpdate(id).orElse(null);
        if (report == null || report.getStatus() != FeedReport.Status.RESOLVED || report.isHold() || report.getResolvedAt() == null
                || !report.getResolvedAt().isBefore(now.minusDays(FeedPolicy.REPORT_RETENTION_DAYS))) return false;
        List<FeedReportImage> snapshots = evidence.findByReport_IdOrderByPositionAscIdAsc(id);
        evidence.deleteAll(snapshots); evidence.flush();
        for (String key : snapshots.stream().map(FeedReportImage::getImageKey).distinct().toList()) {
            if (!media.existsByImageKey(key) && !evidence.existsByImageKey(key) && !commentEvidence.existsByImageKey(key)) deletion.enqueue(key, "feed_report", id);
        }
        reports.delete(report); return true;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean purgeAudit(Long id, LocalDateTime now) {
        LocalDateTime cutoff = policy.accessAuditCutoff(now);
        if (cutoff == null) return false;
        FeedAuditRecord candidate = audits.findById(id).orElse(null);
        if (candidate == null) return false;
        // 신고 생성도 원문 잠금을 사용한다. 해당 게시물이 남아 있으면 새 신고와의 경쟁을 직렬화한다.
        if (candidate.getPromotionId() != null) promotions.findForUpdate(candidate.getPromotionId());
        if (candidate.getPostId() != null) posts.findForUpdate(candidate.getPostId());
        entityManager.refresh(candidate, LockModeType.PESSIMISTIC_WRITE);
        if (!candidate.getCreatedAt().isBefore(cutoff)) return false;
        // 다른 신고가 같은 원문을 참조하면 특정 reportId의 파기 뒤에도 감사 이력을 보존한다.
        if (audits.retainedReports(candidate.getReportId(), candidate.getPostId()) > 0) return false;
        if (candidate.getPostId() != null && audits.retainedCommentReports(candidate.getPostId()) > 0) return false;
        if (candidate.getPromotionId() != null && audits.retainedNewsReports(candidate.getPromotionId()) > 0) return false;
        audits.delete(candidate); return true;
    }

    private void lockOwner(Long id) { entityManager.find(Member.class, id, LockModeType.PESSIMISTIC_WRITE); }

    private void lockPostOwners(FeedPost post) {
        var owners = new java.util.TreeSet<Long>();
        owners.add(post.getProfile().getMember().getId());
        for (FeedMedia image : media.findByComment_Post_IdOrderByIdAsc(post.getId())) owners.add(image.getMember().getId());
        owners.forEach(this::lockOwner);
    }
}
