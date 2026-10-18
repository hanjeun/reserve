package kr.it.reserve.promotion.repository;

import kr.it.reserve.promotion.entity.Promotion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;
import java.time.LocalDateTime;

@Repository
public interface PromotionRepository extends JpaRepository<Promotion, Long>, JpaSpecificationExecutor<Promotion> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Promotion p WHERE p.id = :id")
    Optional<Promotion> findForUpdate(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("SELECT p FROM Promotion p WHERE p.id = :id")
    Optional<Promotion> findForRead(@Param("id") Long id);

    /** 새 혜택과 옛 공개 경로가 목록·count·상세에서 같은 공개 관문을 사용한다. */
    default Page<Promotion> findAllPublic(Pageable pageable) {
        return findAll(kr.it.reserve.promotion.StoreNewsPolicy.publicSpecification(null, null, false),
                PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                        Sort.by(Sort.Direction.DESC, "createdAt", "id")));
    }

    default Optional<Promotion> findPublicById(Long id) {
        return findOne(kr.it.reserve.promotion.StoreNewsPolicy.publicDetailSpecification(id));
    }

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Promotion p SET p.viewCount = p.viewCount + 1 WHERE p.id = :id AND p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND (p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED OR p.feedEnabled = true)")
    int incrementViewCount(@Param("id") Long id);

    // 전체 홍보글 조회 (최신순) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED")
    Page<Promotion> findAllByOrderByCreatedAtDesc(Pageable pageable);

    // 전체 홍보글 조회 (인기순 - 조회수) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED ORDER BY p.viewCount DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED")
    Page<Promotion> findAllByOrderByViewCountDesc(Pageable pageable);

    // 전체 홍보글 조회 (좋아요순) - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED ORDER BY p.likeCount DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED")
    Page<Promotion> findAllByOrderByLikeCountDesc(Pageable pageable);

    // 카테고리별 조회 - store, member fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store JOIN FETCH p.member WHERE p.category = :category AND p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.category = :category AND p.state = kr.it.reserve.promotion.entity.Promotion.State.PUBLISHED AND p.deletedAt IS NULL AND p.benefitState = kr.it.reserve.promotion.entity.Promotion.BenefitState.APPROVED")
    Page<Promotion> findByCategoryOrderByCreatedAtDesc(@Param("category") Promotion.PromotionCategory category, Pageable pageable);

    // 내가 작성한 홍보글 조회 - store fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM Promotion p JOIN FETCH p.store WHERE p.member.id = :memberId ORDER BY p.createdAt DESC",
           countQuery = "SELECT COUNT(p) FROM Promotion p WHERE p.member.id = :memberId")
    Page<Promotion> findByMemberIdOrderByCreatedAtDesc(@Param("memberId") Long memberId, Pageable pageable);

    // 폐업·탈퇴도 즉시 비공개와 30일 파기를 사용한다. 원문/신고를 물리 삭제하지 않는다.
    @Modifying(flushAutomatically = true)
    @Query("UPDATE Promotion p SET p.state = kr.it.reserve.promotion.entity.Promotion.State.DELETED, p.deletedAt = :now, p.updatedAt = :now, p.revision = p.revision + 1 WHERE p.store.id = :storeId AND p.deletedAt IS NULL")
    void softDeleteByStoreId(@Param("storeId") Long storeId, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE Promotion p SET p.state = kr.it.reserve.promotion.entity.Promotion.State.DELETED, p.deletedAt = :now, p.updatedAt = :now, p.revision = p.revision + 1 WHERE p.member.id = :memberId AND p.deletedAt IS NULL")
    void softDeleteByMemberId(@Param("memberId") Long memberId, @Param("now") LocalDateTime now);

    @Query("SELECT p.id FROM Promotion p WHERE p.state = kr.it.reserve.promotion.entity.Promotion.State.DELETED AND p.deletedAt < :cutoff ORDER BY p.id")
    List<Long> purgeNewsCandidates(@Param("cutoff") LocalDateTime cutoff, Pageable pageable);
}
