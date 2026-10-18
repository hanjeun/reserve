package kr.it.reserve.feed.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.entity.FeedReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeedReportRepository extends JpaRepository<FeedReport, Long> {
    Optional<FeedReport> findByPostIdAndReporterId(Long postId, Long reporterId);
    Optional<FeedReport> findByPromotionIdAndReporterId(Long promotionId, Long reporterId);
    Page<FeedReport> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);
    Page<FeedReport> findByStatusOrderByCreatedAtDescIdDesc(FeedReport.Status status, Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM FeedReport r WHERE r.id = :id")
    Optional<FeedReport> findForUpdate(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("SELECT r FROM FeedReport r WHERE r.id = :id")
    Optional<FeedReport> findForRead(@Param("id") Long id);
    @Query("SELECT r.id FROM FeedReport r WHERE r.status = :status AND r.hold = false AND r.resolvedAt < :cutoff ORDER BY r.id")
    List<Long> purgeCandidates(@Param("status") FeedReport.Status status, @Param("cutoff") LocalDateTime cutoff, Pageable pageable);
}
