package kr.it.reserve.audit.repository;

import kr.it.reserve.audit.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

import java.time.LocalDateTime;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM AuditLog a WHERE a.id = :id")
    Optional<AuditLog> findByIdForUpdate(@Param("id") Long id);

    Page<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<AuditLog> findByEntityTypeOrderByCreatedAtDesc(String entityType, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.action = 'SOFT_DELETE' AND a.expiresAt > :now ORDER BY a.createdAt DESC")
    Page<AuditLog> findRestorable(LocalDateTime now, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.action = 'SOFT_DELETE' AND a.entityType = :entityType AND a.expiresAt > :now ORDER BY a.createdAt DESC")
    Page<AuditLog> findRestorableByType(String entityType, LocalDateTime now, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.action = 'SOFT_DELETE' AND a.expiresAt <= :now")
    List<AuditLog> findExpiredSoftDeletes(LocalDateTime now);

    @Modifying
    @Query("DELETE FROM AuditLog a WHERE a.entityType = :entityType AND a.entityId = :entityId AND a.action = 'SOFT_DELETE'")
    void deleteSoftDeleteLog(String entityType, Long entityId);

    @Modifying
    @Query("DELETE FROM AuditLog a WHERE a.action <> 'SOFT_DELETE' AND a.expiresAt < :now")
    int deleteExpiredNonTrash(LocalDateTime now);
}
