package kr.it.reserve.chat.repository;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.entity.ChatReport;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** 저장과 승인된 보존 기간 파기에 한정한다. 임의 갱신 API는 제공하지 않는다. */
public interface ChatReportAccessAuditRepository extends Repository<ChatReportAccessAudit, Long> {
    ChatReportAccessAudit save(ChatReportAccessAudit audit);

    Optional<ChatReportAccessAudit> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM ChatReportAccessAudit a WHERE a.id = :id")
    Optional<ChatReportAccessAudit> findByIdForUpdate(@Param("id") Long id);

    interface RetentionCandidate {
        Long getId();
        Long getReportId();
    }

    @Query("""
            SELECT a.id AS id, a.reportId AS reportId FROM ChatReportAccessAudit a
             WHERE a.accessedAt < :cutoff AND NOT EXISTS (
               SELECT r.id FROM ChatReport r WHERE r.id = a.reportId AND (
                 r.retentionHold = true OR r.status IN :activeStatuses
                 OR r.retentionCategory = :unclassified OR r.retentionCategory IS NULL))
             ORDER BY a.accessedAt, a.id
            """)
    List<RetentionCandidate> findRetentionCandidates(@Param("cutoff") LocalDateTime cutoff,
            @Param("activeStatuses") Collection<ChatReport.Status> activeStatuses,
            @Param("unclassified") ChatReport.RetentionCategory unclassified, Pageable pageable);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ChatReportAccessAudit a WHERE a.reportId = :reportId AND a.accessedAt < :cutoff")
    void deleteExpiredByReportId(@Param("reportId") Long reportId, @Param("cutoff") LocalDateTime cutoff);

    void delete(ChatReportAccessAudit audit);
}
