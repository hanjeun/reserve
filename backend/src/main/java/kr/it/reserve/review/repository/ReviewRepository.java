package kr.it.reserve.review.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import kr.it.reserve.store.entity.Store;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Review r WHERE r.id = :id AND r.deletedAt IS NULL")
    Optional<Review> findForUpdate(Long id);

    interface MutationScope {
        Long getStoreId();
        Long getReservationId();
    }

    @Query("SELECT r.store.id AS storeId, r.reservation.id AS reservationId FROM Review r WHERE r.id = :id")
    Optional<MutationScope> findMutationScope(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Review r WHERE r.id = :id")
    Optional<Review> findAnyForUpdate(Long id);

    @Query("""
            SELECT p FROM ReviewPhoto p JOIN FETCH p.review r JOIN FETCH r.member JOIN FETCH r.store
             WHERE r.id = :reviewId AND p.id = :photoId AND r.deletedAt IS NULL AND r.moderationHidden = false
            """)
    Optional<ReviewPhoto> findPublishedPhoto(Long reviewId, Long photoId);

    // 가게의 리뷰 목록 조회 (최신순)
    List<Review> findByStoreOrderByCreatedAtDesc(Store store);

    // 가게의 리뷰 목록 조회 - store, member fetch join으로 N+1 방지 (소프트 삭제된 리뷰 제외)
    @Query("SELECT r FROM Review r JOIN FETCH r.member JOIN FETCH r.store WHERE r.store.id = :storeId AND r.deletedAt IS NULL AND r.moderationHidden = false ORDER BY r.createdAt DESC")
    List<Review> findByStoreIdOrderByCreatedAtDesc(@Param("storeId") Long storeId);

    // 회원의 리뷰 목록 조회 - store fetch join으로 N+1 방지 (소프트 삭제된 리뷰 제외)
    @Query("SELECT r FROM Review r JOIN FETCH r.store WHERE r.member = :member AND r.deletedAt IS NULL ORDER BY r.createdAt DESC")
    List<Review> findByMemberOrderByCreatedAtDesc(@Param("member") Member member);

    // 예약에 대한 리뷰 조회
    Optional<Review> findByReservation(Reservation reservation);

    // 예약 ID로 리뷰 존재 여부 확인
    boolean existsByReservationId(Long reservationId);

    // 예약 ID로 리뷰 조회
    Optional<Review> findByReservationId(Long reservationId);

    // 가게의 평균 별점 조회
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.store.id = :storeId AND r.deletedAt IS NULL AND r.moderationHidden = false")
    Double findAverageRatingByStoreId(@Param("storeId") Long storeId);

    // 가게의 리뷰 개수 조회
    @Query("SELECT COUNT(r) FROM Review r WHERE r.store.id = :storeId AND r.deletedAt IS NULL AND r.moderationHidden = false")
    long countByStoreId(Long storeId);

    @Query("""
            SELECT r FROM Review r WHERE r.store.id = :storeId AND r.member.id = :memberId
                AND r.deletedAt IS NULL AND r.moderationHidden = false ORDER BY r.createdAt DESC, r.id DESC
            """)
    Page<Review> findPublishedCustomerReviews(Long storeId, Long memberId, Pageable page);

    @EntityGraph(attributePaths = "store")
    @Query("""
            SELECT r FROM Review r JOIN r.store s
             WHERE r.member.id = :memberId AND r.deletedAt IS NULL AND r.moderationHidden = false
               AND (:mine = true OR r.authorAlias IS NULL)
               AND s.deletedAt IS NULL AND (s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
                   OR (s.status = kr.it.reserve.store.entity.StoreStatus.SUSPENDED AND s.suspendedUntil < :now))
             ORDER BY r.createdAt DESC, r.id DESC
            """)
    Page<Review> findPublishedProfileReviews(Long memberId, boolean mine, LocalDateTime now, Pageable page);

    @Modifying
    @Query("UPDATE Review r SET r.deletedAt = NULL WHERE r.id = :id")
    void restoreById(Long id);

}
