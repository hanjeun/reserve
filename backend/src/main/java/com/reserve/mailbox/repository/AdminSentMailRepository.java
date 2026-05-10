package com.reserve.mailbox.repository;

import com.reserve.mailbox.entity.AdminSentMail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface AdminSentMailRepository extends JpaRepository<AdminSentMail, Long> {

    List<AdminSentMail> findByDeletedAtIsNullOrderBySentAtDesc();

    @Modifying
    @Query("UPDATE AdminSentMail m SET m.deletedAt = NULL WHERE m.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM AdminSentMail m WHERE m.deletedAt IS NOT NULL AND m.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(LocalDateTime cutoff);
}
