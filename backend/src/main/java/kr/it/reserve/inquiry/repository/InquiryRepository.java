package kr.it.reserve.inquiry.repository;

import kr.it.reserve.inquiry.entity.Inquiry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface InquiryRepository extends JpaRepository<Inquiry, Long> {

    // 회원별 문의 조회 (페이징) - member는 이미 memberId로 필터링되어 단일이지만 LAZY 초기화 방지
    @Query(value = "SELECT i FROM Inquiry i JOIN FETCH i.member WHERE i.member.id = :memberId ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i WHERE i.member.id = :memberId")
    Page<Inquiry> findByMemberIdOrderByCreatedAtDesc(@Param("memberId") Long memberId, Pageable pageable);

    // 전체 문의 조회 (관리자용, 페이징) - member fetch join으로 N+1 방지
    @Query(value = "SELECT i FROM Inquiry i JOIN FETCH i.member ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i")
    Page<Inquiry> findAllByOrderByCreatedAtDesc(Pageable pageable);

    // 카테고리별 조회
    Page<Inquiry> findByCategoryOrderByCreatedAtDesc(Inquiry.InquiryCategory category, Pageable pageable);

    // 상태별 조회
    Page<Inquiry> findByStatusOrderByCreatedAtDesc(Inquiry.InquiryStatus status, Pageable pageable);

    // 회원의 미답변 문의 개수
    Long countByMemberIdAndStatus(Long memberId, Inquiry.InquiryStatus status);

    // 전체 미답변 개수 조희를 위한 메서드
    Long countByStatus(Inquiry.InquiryStatus status);

}
