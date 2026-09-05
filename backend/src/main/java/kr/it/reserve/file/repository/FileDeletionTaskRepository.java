package kr.it.reserve.file.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.file.entity.FileDeletionTask;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FileDeletionTaskRepository extends JpaRepository<FileDeletionTask, Long> {

    Optional<FileDeletionTask> findByTargetHash(String targetHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM FileDeletionTask t WHERE t.id = :id")
    Optional<FileDeletionTask> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            SELECT t.id FROM FileDeletionTask t
             WHERE t.status IN :statuses AND t.nextAttemptAt <= :now
             ORDER BY t.nextAttemptAt ASC, t.id ASC
            """)
    List<Long> findRetryableIds(
            @Param("statuses") java.util.Collection<FileDeletionTask.Status> statuses,
            @Param("now") LocalDateTime now,
            Pageable pageable);
}
