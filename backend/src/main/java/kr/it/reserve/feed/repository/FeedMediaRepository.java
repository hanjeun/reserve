package kr.it.reserve.feed.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.entity.FeedMedia;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeedMediaRepository extends JpaRepository<FeedMedia, Long> {
    List<FeedMedia> findByPost_IdOrderByPositionAscIdAsc(Long postId);
    List<FeedMedia> findByComment_IdOrderByPositionAscIdAsc(Long commentId);
    List<FeedMedia> findByComment_Post_IdOrderByIdAsc(Long postId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM FeedMedia m WHERE m.id = :id")
    Optional<FeedMedia> findForUpdate(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("SELECT m FROM FeedMedia m WHERE m.id = :id")
    Optional<FeedMedia> findForRead(@Param("id") Long id);
    boolean existsByImageKey(String imageKey);
    @Query("SELECT m.id FROM FeedMedia m WHERE m.post IS NULL AND m.comment IS NULL AND COALESCE(m.detachedAt, m.createdAt) < :cutoff ORDER BY m.id")
    List<Long> orphanCandidates(@Param("cutoff") LocalDateTime cutoff, Pageable pageable);
    @Query("SELECT m.member.id FROM FeedMedia m WHERE m.id = :id")
    Optional<Long> ownerId(@Param("id") Long id);
}
