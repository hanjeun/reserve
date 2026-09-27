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
