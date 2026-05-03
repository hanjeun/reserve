package com.reserve.mailbox.repository;

import com.reserve.mailbox.entity.AdminMail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AdminMailRepository extends JpaRepository<AdminMail, Long> {

    /** 수신일 내림차순 전체 목록 (replies 제외 — 목록은 preview만) */
    List<AdminMail> findAllByOrderByReceivedAtDesc();

    /** 상세 조회 — replies 즉시 로딩 */
    @Query("SELECT m FROM AdminMail m LEFT JOIN FETCH m.replies WHERE m.id = :id")
    Optional<AdminMail> findByIdWithReplies(Long id);

    /** 읽지 않은 메일 개수 */
    long countByIsReadFalse();
}
