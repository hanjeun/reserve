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

public interface ChatReportRepository extends JpaRepository<ChatReport, Long> {

    /** 스냅샷이 없는 이전 신고는 backfill 완료 전까지 방 원문을 보수적으로 보류한다. */
    @Query("""
            SELECT COUNT(r) FROM ChatReport r WHERE r.room.id = :roomId
              AND r.evidenceCapturedAt IS NULL
            """)
    long countLegacyEvidenceHolds(@Param("roomId") Long roomId);

    Optional<ChatReport> findByReportKey(String reportKey);

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
