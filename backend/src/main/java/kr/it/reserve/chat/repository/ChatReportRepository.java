package kr.it.reserve.chat.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.chat.entity.ChatReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface ChatReportRepository extends JpaRepository<ChatReport, Long> {

    /** 스냅샷이 없는 이전 신고는 backfill 완료 전까지 방 원문을 보수적으로 보류한다. */
    @Query("""
            SELECT COUNT(r) FROM ChatReport r WHERE r.room.id = :roomId
              AND r.evidenceCapturedAt IS NULL
            """)
    long countLegacyEvidenceHolds(@Param("roomId") Long roomId);

    /** 진행 중인 사건과 법정 보존 증거의 원문은 같은 방 잠금 아래에서 보호한다. */
    @Query("""
            SELECT COUNT(r) FROM ChatReport r WHERE r.room.id = :roomId AND (
              r.evidenceCapturedAt IS NULL OR r.retentionHold = true OR r.status IN :activeStatuses
              OR r.retentionCategory IN :heldCategories OR r.retentionCategory IS NULL
              OR r.minimumRetentionUntil >= :now)
            """)
    long countOriginalRetentionHolds(@Param("roomId") Long roomId,
                                    @Param("activeStatuses") Collection<ChatReport.Status> activeStatuses,
                                    @Param("heldCategories") Collection<ChatReport.RetentionCategory> heldCategories,
                                    @Param("now") LocalDateTime now);

    interface RetentionCandidate {
        Long getId();
        Long getRoomId();
    }

    @Query("""
            SELECT r.id AS id, r.room.id AS roomId FROM ChatReport r
             WHERE r.status IN :terminalStatuses AND r.retentionHold = false AND r.reviewedAt IS NOT NULL
               AND (r.minimumRetentionUntil IS NULL OR r.minimumRetentionUntil < :now)
               AND ((r.retentionCategory = :generalCategory AND r.reviewedAt < :generalCutoff)
                 OR (r.retentionCategory = :consumerCategory AND r.reviewedAt < :consumerCutoff)
                 OR (r.retentionCategory = :contractCategory AND r.retentionBasisAt < :contractCutoff))
             ORDER BY r.reviewedAt, r.id
            """)
    List<RetentionCandidate> findRetentionCandidates(
            @Param("terminalStatuses") Collection<ChatReport.Status> terminalStatuses,
            @Param("generalCategory") ChatReport.RetentionCategory generalCategory,
            @Param("generalCutoff") LocalDateTime generalCutoff,
            @Param("consumerCategory") ChatReport.RetentionCategory consumerCategory,
            @Param("consumerCutoff") LocalDateTime consumerCutoff,
            @Param("contractCategory") ChatReport.RetentionCategory contractCategory,
            @Param("contractCutoff") LocalDateTime contractCutoff,
            @Param("now") LocalDateTime now, Pageable pageable);

    Optional<ChatReport> findByReportKey(String reportKey);

    /** 잠금 전 방 ID만 읽어 오래된 관리 엔티티가 1차 캐시에 남지 않게 한다. */
    @Query("SELECT r.room.id FROM ChatReport r WHERE r.id = :id")
    Optional<Long> findRoomIdById(@Param("id") Long id);

    @Query(value = """
            SELECT r FROM ChatReport r
             JOIN FETCH r.room
             ORDER BY r.createdAt DESC, r.id DESC
            """, countQuery = "SELECT COUNT(r) FROM ChatReport r")
    Page<ChatReport> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    @Query(value = """
            SELECT r FROM ChatReport r
             JOIN FETCH r.room
             WHERE r.status = :status
             ORDER BY r.createdAt DESC, r.id DESC
            """, countQuery = "SELECT COUNT(r) FROM ChatReport r WHERE r.status = :status")
    Page<ChatReport> findByStatusOrderByCreatedAtDescIdDesc(
            @Param("status") ChatReport.Status status, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ChatReport r WHERE r.id = :id")
    Optional<ChatReport> findByIdForUpdate(@Param("id") Long id);
}
