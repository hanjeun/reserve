package kr.it.reserve.review.repository;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.store.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    // 가게의 리뷰 목록 조회 (최신순)
    List<Review> findByStoreOrderByCreatedAtDesc(Store store);

    // 가게의 리뷰 목록 조회 - store, member fetch join으로 N+1 방지 (소프트 삭제된 리뷰 제외)
    @Query("SELECT r FROM Review r JOIN FETCH r.member WHERE r.store.id = :storeId AND r.deletedAt IS NULL ORDER BY r.createdAt DESC")
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
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.store.id = :storeId")
    Double findAverageRatingByStoreId(@Param("storeId") Long storeId);

    // 가게의 리뷰 개수 조회
    long countByStoreId(Long storeId);

    @Modifying
    @Query("UPDATE Review r SET r.deletedAt = NULL WHERE r.id = :id")
    void restoreById(Long id);

}
