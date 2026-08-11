package kr.it.reserve.payment.repository;

import kr.it.reserve.payment.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    
    // 가맹점 주문번호로 조회
    Optional<Payment> findByMerchantUid(String merchantUid);
    
    // 포트원 결제번호로 조회
    Optional<Payment> findByImpUid(String impUid);
    
    // 예약 ID로 조회 (단일 - 주의: 레코드 여러 개면 예외 발생)
    Optional<Payment> findByReservationId(Long reservationId);

    /**
     * 예약 ID + PAID 상태로 가장 최근 1건.
     *
     * <p>★ {@code LIMIT 1} 이 반드시 있어야 한다 (2026-08-11 추가).
     * 반환 타입이 {@link Optional} 이라 "0개 또는 1개"를 기대하는데, 이 조건으로 PAID 가 2행 이상
     * 나올 수 있는 경로가 존재한다(부분 환불 후 재결제 등). 그러면 Hibernate 가
     * {@code NonUniqueResultException} 을 던져 <b>환불·취소가 통째로 500</b> 이 된다.
     * {@code ORDER BY} 만으로는 행 수가 줄지 않는다.
     */
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId AND p.status = 'PAID' ORDER BY p.createdAt DESC LIMIT 1")
    Optional<Payment> findPaidByReservationId(@Param("reservationId") Long reservationId);

    // 예약 ID + READY 상태로 가장 최근 조회 (결제창 재시도용)
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId AND p.status = 'READY' ORDER BY p.createdAt DESC")
    List<Payment> findReadyByReservationId(@Param("reservationId") Long reservationId);
    
    // 회원 ID로 결제 목록 조회
    List<Payment> findByMemberIdOrderByCreatedAtDesc(Long memberId);
    
    // 결제 상태로 조회
    List<Payment> findByStatus(Payment.PaymentStatus status);
    
    // 회원 ID와 결제 상태로 조회
    List<Payment> findByMemberIdAndStatus(Long memberId, Payment.PaymentStatus status);
    
    // 가게 ID로 결제 목록 조회 (사업자용)
    @Query("SELECT p FROM Payment p JOIN p.reservation r WHERE r.store.id = :storeId ORDER BY p.createdAt DESC")
    List<Payment> findByStoreId(@Param("storeId") Long storeId);

    // 가게 ID로 결제 전체 삭제 (가게 삭제 시 사용)
    @Modifying
    @Query("DELETE FROM Payment p WHERE p.reservation.id IN (SELECT r.id FROM Reservation r WHERE r.store.id = :storeId)")
    void deleteByStoreId(@Param("storeId") Long storeId);
}
