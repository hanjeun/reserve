package com.reserve.mailbox.repository;

import com.reserve.mailbox.entity.AdminMail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AdminMailRepository extends JpaRepository<AdminMail, Long> {

    /** 수신일 내림차순 전체 목록 (삭제되지 않은 것만) */
    List<AdminMail> findByDeletedAtIsNullOrderByReceivedAtDesc();

    /** 상세 조회 — replies 즉시 로딩 */
    @Query("SELECT m FROM AdminMail m LEFT JOIN FETCH m.replies WHERE m.id = :id AND m.deletedAt IS NULL")
    Optional<AdminMail> findByIdWithReplies(Long id);

    /** 읽지 않은 메일 개수 */
    long countByIsReadFalseAndDeletedAtIsNull();

    /** 복구 */
    @Modifying
    @Query("UPDATE AdminMail m SET m.deletedAt = NULL WHERE m.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM AdminMail m WHERE m.deletedAt IS NOT NULL AND m.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(LocalDateTime cutoff);
}

