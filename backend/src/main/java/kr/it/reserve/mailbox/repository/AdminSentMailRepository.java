package kr.it.reserve.mailbox.repository;

import kr.it.reserve.mailbox.entity.AdminSentMail;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AdminSentMailRepository extends JpaRepository<AdminSentMail, Long> {

    /**
     * 전량 조회. 휴지통·배치처럼 "전부가 필요한" 곳에서만 쓴다.
     * 화면 목록은 아래 {@link #findByDeletedAtIsNullOrderBySentAtDesc(Pageable)} 를 쓴다.
     */
    List<AdminSentMail> findByDeletedAtIsNullOrderBySentAtDesc();

    Page<AdminSentMail> findByDeletedAtIsNullOrderBySentAtDesc(Pageable pageable);

    /**
     * 관리자 메일함 검색 — 받는사람·제목 기준(서버 사이드).
     * 본문은 검색 대상에서 제외했다 — 길어서 풀스캔 비용이 크고,
     * 기존 화면의 클라이언트 필터도 받는사람·제목만 보고 있었다(동작 동일 유지).
     */
    @Query("""
            SELECT m FROM AdminSentMail m
             WHERE m.deletedAt IS NULL
               AND (LOWER(m.toEmail) LIKE LOWER(CONCAT('%', :keyword, '%'))
                 OR LOWER(m.subject) LIKE LOWER(CONCAT('%', :keyword, '%')))
             ORDER BY m.sentAt DESC
            """)
    Page<AdminSentMail> searchByToEmailOrSubject(@Param("keyword") String keyword, Pageable pageable);

    @Modifying
    @Query("UPDATE AdminSentMail m SET m.deletedAt = NULL WHERE m.id = :id")
    void restoreById(Long id);

}
