package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedAuditRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface FeedAuditRepository extends JpaRepository<FeedAuditRecord, Long> {
    Page<FeedAuditRecord> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);
    Page<FeedAuditRecord> findByActionOrderByCreatedAtDescIdDesc(String action, Pageable pageable);
    @Query("SELECT a.id FROM FeedAuditRecord a WHERE a.createdAt < :cutoff AND NOT EXISTS "
            + "(SELECT r.id FROM FeedReport r WHERE r.id = a.reportId OR r.postId = a.postId OR r.promotionId = a.promotionId) AND NOT EXISTS "
            + "(SELECT c.id FROM FeedCommentReport c WHERE c.postId = a.postId) ORDER BY a.id")
    List<Long> purgeCandidates(@Param("cutoff") LocalDateTime cutoff, Pageable pageable);
    @Query("SELECT COUNT(r) FROM FeedReport r WHERE (:reportId IS NOT NULL AND r.id = :reportId) "
            + "OR (:postId IS NOT NULL AND r.postId = :postId)")
    long retainedReports(@Param("reportId") Long reportId, @Param("postId") Long postId);
    @Query("SELECT COUNT(r) FROM FeedReport r WHERE r.promotionId = :promotionId")
    long retainedNewsReports(@Param("promotionId") Long promotionId);
    @Query("SELECT COUNT(c) FROM FeedCommentReport c WHERE c.postId = :postId")
    long retainedCommentReports(@Param("postId") Long postId);
}
