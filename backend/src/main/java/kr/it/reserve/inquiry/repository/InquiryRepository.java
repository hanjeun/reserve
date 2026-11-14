package kr.it.reserve.inquiry.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.inquiry.entity.Inquiry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface InquiryRepository extends JpaRepository<Inquiry, Long> {

    boolean existsByResendEmailId(String resendEmailId);

    // 회원별 문의 조회 (페이징) - member는 이미 memberId로 필터링되어 단일이지만 LAZY 초기화 방지
    @Query(value = "SELECT i FROM Inquiry i JOIN FETCH i.member WHERE i.member.id = :memberId AND i.deletedAt IS NULL ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i WHERE i.member.id = :memberId AND i.deletedAt IS NULL")
    Page<Inquiry> findByMemberIdOrderByCreatedAtDesc(@Param("memberId") Long memberId, Pageable pageable);

    // 전체 문의 조회 (관리자용, 페이징) - 비회원 문의(member=null)도 보존하면서 회원 N+1을 방지
    @Query(value = "SELECT i FROM Inquiry i LEFT JOIN FETCH i.member WHERE i.deletedAt IS NULL ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i WHERE i.deletedAt IS NULL")
    Page<Inquiry> findAllByOrderByCreatedAtDesc(Pageable pageable);

    String ADMIN_SEARCH = """
            WHERE i.deletedAt IS NULL AND (LOWER(i.title) LIKE :pattern ESCAPE '!'
               OR LOWER(COALESCE(m.email, i.guestEmail)) LIKE :pattern ESCAPE '!'
               OR LOWER(COALESCE(m.name, i.guestName)) LIKE :pattern ESCAPE '!')
            """;

    @Query(value = "SELECT i FROM Inquiry i LEFT JOIN FETCH i.member m " + ADMIN_SEARCH + " ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i LEFT JOIN i.member m " + ADMIN_SEARCH)
    Page<Inquiry> searchForAdmin(@Param("pattern") String pattern, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inquiry i WHERE i.id = :id")
    Optional<Inquiry> findByIdForUpdate(@Param("id") Long id);

    // 카테고리별 조회
    Page<Inquiry> findByCategoryAndDeletedAtIsNullOrderByCreatedAtDesc(Inquiry.InquiryCategory category, Pageable pageable);

    // 상태별 조회
    Page<Inquiry> findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(Inquiry.InquiryStatus status, Pageable pageable);

    // 회원의 미답변 문의 개수
    Long countByMemberIdAndStatusAndDeletedAtIsNull(Long memberId, Inquiry.InquiryStatus status);

    // 전체 미답변 개수 조희를 위한 메서드
    Long countByStatusAndDeletedAtIsNull(Inquiry.InquiryStatus status);

    @Modifying
    @Query("UPDATE Inquiry i SET i.deletedAt = NULL WHERE i.id = :id AND i.deletedAt IS NOT NULL")
    int restoreTrashed(Long id);

    @Modifying
    @Query("DELETE FROM Inquiry i WHERE i.id = :id AND i.deletedAt IS NOT NULL")
    void deleteTrashed(Long id);

}
