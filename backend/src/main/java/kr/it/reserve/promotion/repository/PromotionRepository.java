package kr.it.reserve.promotion.repository;

import kr.it.reserve.promotion.entity.Promotion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    /** 공개 노출과 total에 같은 가게 상태 조건을 적용한다. 작성자는 fetch하지 않는다. */
    @Query(value = """
            SELECT p FROM Promotion p JOIN FETCH p.store s
             WHERE s.deletedAt IS NULL AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
             ORDER BY p.createdAt DESC, p.id DESC
            """,
            countQuery = """
            SELECT COUNT(p) FROM Promotion p JOIN p.store s
             WHERE s.deletedAt IS NULL AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
            """)
    Page<Promotion> findAllPublic(Pageable pageable);

    @Query("""
            SELECT p FROM Promotion p JOIN FETCH p.store s
             WHERE p.id = :id AND s.deletedAt IS NULL
               AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
            """)
    Optional<Promotion> findPublicById(@Param("id") Long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Promotion p SET p.viewCount = p.viewCount + 1 WHERE p.id = :id")
    int incrementViewCount(@Param("id") Long id);

    // 전체 홍보글 조회 (최신순) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p")
    Page<Promotion> findAllByOrderByCreatedAtDesc(Pageable pageable);

    // 전체 홍보글 조회 (인기순 - 조회수) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member ORDER BY p.viewCount DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p")
    Page<Promotion> findAllByOrderByViewCountDesc(Pageable pageable);

    // 전체 홍보글 조회 (좋아요순) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member ORDER BY p.likeCount DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p")
    Page<Promotion> findAllByOrderByLikeCountDesc(Pageable pageable);

    // 카테고리별 조회 - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member WHERE p.category = :category ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.category = :category")
    Page<Promotion> findByCategoryOrderByCreatedAtDesc(@Param("category") Promotion.PromotionCategory category, Pageable pageable);

    // 내가 작성한 홍보글 조회 - store fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store WHERE p.member.id = :memberId ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.member.id = :memberId")
    Page<Promotion> findByMemberIdOrderByCreatedAtDesc(@Param("memberId") Long memberId, Pageable pageable);

    // 특정 가게의 모든 홍보글 삭제
    @Modifying
    @Query("DELETE FROM Promotion p WHERE p.store.id = :storeId")
    void deleteByStoreId(@Param("storeId") Long storeId);

    // 특정 회원의 모든 홍보글 삭제
    @Modifying
    @Query("DELETE FROM Promotion p WHERE p.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") Long memberId);
}
