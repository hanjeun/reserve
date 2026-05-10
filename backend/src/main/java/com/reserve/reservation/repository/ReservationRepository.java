package com.reserve.reservation.repository;

import com.reserve.member.entity.Member;
import com.reserve.reservation.entity.Reservation;
import com.reserve.review.entity.Review;
import com.reserve.store.entity.Store;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    /**
     * 특정 회원의 예약 내역 조회 (최신순) - store, member fetch join으로 N+1 방지
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store JOIN FETCH r.member WHERE r.member = :member ORDER BY r.createdAt DESC")
    List<Reservation> findByMemberOrderByCreatedAtDesc(@Param("member") Member member);

    /**
     * 특정 가게 소유자의 전체 예약 목록 조회 (최신순) - store, member fetch join으로 N+1 방지
     * ADMIN: 전체 예약, BUSINESS: 본인 가게 예약
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member WHERE s.owner = :owner ORDER BY r.createdAt DESC")
    List<Reservation> findByStoreOwnerOrderByCreatedAtDesc(@Param("owner") Member owner);

    /**
     * BUSINESS 전용: 본인 가게 예약 목록 조회 (최신순, 페이지네이션)
     * countQuery 분리로 fetch join + Page 조합 시 발생하는 count 쿼리 오류 방지
     */
    @Query(value = "SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member WHERE s.owner = :owner ORDER BY r.createdAt DESC",
           countQuery = "SELECT COUNT(r) FROM Reservation r JOIN r.store s WHERE s.owner = :owner")
    Page<Reservation> findByStoreOwnerOrderByCreatedAtDesc(@Param("owner") Member owner, Pageable pageable);

    /**
     * ADMIN 전용: 전체 예약 목록 조회 (최신순, 페이지네이션) - store, member fetch join으로 N+1 방지
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store JOIN FETCH r.member ORDER BY r.createdAt DESC")
    Page<Reservation> findAllWithStoreAndMemberPaged(Pageable pageable);

    /**
     * 특정 가게의 예약 내역 조회 (최신순) - member fetch join으로 N+1 방지
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.member WHERE r.store = :store ORDER BY r.createdAt DESC")
    List<Reservation> findByStoreOrderByCreatedAtDesc(@Param("store") Store store);

    /**
     * 회원의 COMPLETED 예약 ID 목록에 해당하는 리뷰 ID를 한 번에 조회
     * (getMyReservations N+1 방지: COMPLETED 예약마다 review SELECT 대신 IN 쿼리 1번)
     * 반환: [reservationId, reviewId] 쌍의 Object[] 리스트
     */
    @Query("SELECT rv.reservation.id, rv.id FROM Review rv WHERE rv.reservation.id IN :reservationIds")
    List<Object[]> findReviewIdsByReservationIds(@Param("reservationIds") List<Long> reservationIds);

    /**
     * 특정 가게의 모든 예약 삭제
     */
    @Modifying
    @Query("DELETE FROM Reservation r WHERE r.store.id = :storeId")
    void deleteByStoreId(@Param("storeId") Long storeId);

    /**
     * 특정 회원의 모든 예약 삭제
     */
    @Modifying
    @Query("DELETE FROM Reservation r WHERE r.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") Long memberId);

    /**
     * 가게별 예약 목록 조회 (페이징)
     */
    Page<Reservation> findByStoreOrderByReservationDateDescReservationTimeDesc(Store store, Pageable pageable);

    /**
     * 동시간대 활성 예약의 인원 합계 조회 (PENDING + CONFIRMED)
     * maxCapacityPerSlot 기반 자리 여부 체크에 사용
     */
    @Query("SELECT COALESCE(SUM(r.guestCount), 0) FROM Reservation r WHERE r.store.id = :storeId AND r.reservationDate = :date AND r.reservationTime = :time AND r.status IN ('PENDING', 'CONFIRMED')")
    int sumActiveGuestsBySlot(
            @Param("storeId") Long storeId,
            @Param("date") java.time.LocalDate date,
            @Param("time") java.time.LocalTime time
    );

    /**
     * 가게별 예약자 이름으로 검색
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.member.name LIKE %:keyword% ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByMemberName(@Param("store") Store store, @Param("keyword") String keyword, Pageable pageable);

    /**
     * 가게별 예약자 이메일로 검색
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.member.email LIKE %:keyword% ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByMemberEmail(@Param("store") Store store, @Param("keyword") String keyword, Pageable pageable);

    /**
     * 가게별 예약 날짜로 검색
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.reservationDate = :date ORDER BY r.reservationTime DESC")
    Page<Reservation> searchByReservationDate(@Param("store") Store store, @Param("date") LocalDate date, Pageable pageable);

    /**
     * 가게별 예약 상태로 검색
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.status = :status ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByStatus(@Param("store") Store store, @Param("status") Reservation.ReservationStatus status, Pageable pageable);

    /**
     * 가게별 복합 검색 (이름 또는 이메일)
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND (r.member.name LIKE %:keyword% OR r.member.email LIKE %:keyword%) ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByKeyword(@Param("store") Store store, @Param("keyword") String keyword, Pageable pageable);

    /**
     * 가게별 복합 검색 (키워드 + 상태)
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.status = :status AND (r.member.name LIKE %:keyword% OR r.member.email LIKE %:keyword%) ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByKeywordAndStatus(@Param("store") Store store, @Param("keyword") String keyword, @Param("status") Reservation.ReservationStatus status, Pageable pageable);

    /**
     * 가게별 복합 검색 (날짜 범위)
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.reservationDate BETWEEN :startDate AND :endDate ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByDateRange(@Param("store") Store store, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate, Pageable pageable);

    /**
     * 가게별 복합 검색 (키워드 + 날짜 범위)
     */
    @Query("SELECT r FROM Reservation r WHERE r.store = :store AND r.reservationDate BETWEEN :startDate AND :endDate AND (r.member.name LIKE %:keyword% OR r.member.email LIKE %:keyword%) ORDER BY r.reservationDate DESC, r.reservationTime DESC")
    Page<Reservation> searchByKeywordAndDateRange(@Param("store") Store store, @Param("keyword") String keyword, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate, Pageable pageable);

    /**
     * 중복 예약 방지: 같은 회원이 같은 가게+날짜에 이미 활성 예약(PENDING/CONFIRMED)이 있는지 확인
     */
    @Query("SELECT COUNT(r) > 0 FROM Reservation r WHERE r.member.id = :memberId AND r.store.id = :storeId AND r.reservationDate = :date AND r.status IN ('PENDING', 'CONFIRMED')")
    boolean existsActiveReservationByMemberAndStoreAndDate(
            @Param("memberId") Long memberId,
            @Param("storeId") Long storeId,
            @Param("date") LocalDate date
    );

    /**
     * 가게 삭제 전 활성 예약(PENDING/CONFIRMED) 건수 조회
     */
    @Query("SELECT COUNT(r) FROM Reservation r WHERE r.store.id = :storeId AND r.status IN ('PENDING', 'CONFIRMED')")
    int countActiveReservationsByStoreId(@Param("storeId") Long storeId);

    /**
     * 미결제 만료 대상 예약 조회
     * - PENDING 상태
     * - depositAmount > 0 (예약금 있는 가게)
     * - depositPaid = false
     * - createdAt < :expiredBefore (가게별 timeout 기준 시각보다 오래된 것)
     * store.paymentTimeoutMinutes 기반으로 만료 기준을 각 가게별로 계산하기 위해
     * 스케줄러에서 조회 후 Java 레벨에서 필터링
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member "
         + "WHERE r.status = 'PENDING' AND r.depositAmount > 0 AND r.depositPaid = false "
         + "AND r.createdAt < :cutoff")
    List<Reservation> findExpiredUnpaidReservations(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Query("UPDATE Reservation r SET r.deletedAt = NULL WHERE r.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM Reservation r WHERE r.deletedAt IS NOT NULL AND r.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(LocalDateTime cutoff);
}
