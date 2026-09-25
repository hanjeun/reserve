package kr.it.reserve.config.oauth2.outbox;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OAuthUnlinkTaskRepository extends JpaRepository<OAuthUnlinkTask, Long> {

    long countByStatusIn(Collection<OAuthUnlinkTask.Status> statuses);

    Optional<OAuthUnlinkTask> findByTaskKey(String taskKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT task FROM OAuthUnlinkTask task WHERE task.id = :id")
    Optional<OAuthUnlinkTask> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            SELECT task.id FROM OAuthUnlinkTask task
             WHERE task.status IN :statuses AND task.nextAttemptAt <= :now
             ORDER BY task.nextAttemptAt ASC, task.id ASC
            """)
    List<Long> findRetryableIds(
            @Param("statuses") Collection<OAuthUnlinkTask.Status> statuses,
            @Param("now") LocalDateTime now,
            Pageable pageable);
}
