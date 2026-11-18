package kr.it.reserve.moderation.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.moderation.entity.ServiceReport;
import kr.it.reserve.moderation.entity.ServiceReport.TargetType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;

public interface ServiceReportRepository extends JpaRepository<ServiceReport, Long> {
    @Modifying
    @Query(value = """
            INSERT INTO service_report(target_type, target_id, store_id, subject_member_id, reason, status, created_at, last_activity_at, revision)
            VALUES(:type, :targetId, :storeId, :subjectMemberId, :reason, 'OPEN', :now, :now, 0)
            ON DUPLICATE KEY UPDATE id = id
            """, nativeQuery = true)
    void insertTarget(String type, Long targetId, Long storeId, Long subjectMemberId, String reason, LocalDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ServiceReport> findByTargetTypeAndTargetId(TargetType targetType, Long targetId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ServiceReport r WHERE r.id = :id")
    Optional<ServiceReport> lockById(Long id);

    @Query("""
            SELECT r FROM ServiceReport r WHERE (r.reviewedAt IS NOT NULL AND r.subjectMemberId = :memberId)
               OR EXISTS (SELECT e.id FROM ServiceReportEntry e WHERE e.reportId = r.id AND e.actorId = :memberId AND e.kind = 'REPORT')
               OR (r.targetType = 'RESERVATION' AND EXISTS (SELECT s.id FROM Store s WHERE s.id = r.storeId AND s.owner.id = :memberId AND s.deletedAt IS NULL))
            ORDER BY r.lastActivityAt DESC, r.id DESC
            """)
    Page<ServiceReport> casesFor(Long memberId, Pageable page);
}
