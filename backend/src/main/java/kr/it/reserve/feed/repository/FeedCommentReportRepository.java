package kr.it.reserve.feed.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.entity.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeedCommentReportRepository extends JpaRepository<FeedCommentReport, Long> {
    Optional<FeedCommentReport> findByCommentIdAndReporterId(Long comment, Long reporter);
    Page<FeedCommentReport> findAllByOrderByCreatedAtDescIdDesc(Pageable page);
    Page<FeedCommentReport> findByStatusOrderByCreatedAtDescIdDesc(FeedReport.Status status, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("SELECT r FROM FeedCommentReport r WHERE r.id = :id")
    Optional<FeedCommentReport> findForUpdate(@Param("id") Long id);
    @Query("SELECT r.id FROM FeedCommentReport r WHERE r.status = kr.it.reserve.feed.entity.FeedReport.Status.RESOLVED AND r.hold = false AND r.resolvedAt < :cutoff ORDER BY r.id")
    List<Long> purgeCandidates(@Param("cutoff") LocalDateTime cutoff, Pageable page);
}
