package com.reserve.payment.repository;

import com.reserve.payment.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
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

    // 예약 ID + PAID 상태로 조회 (안전한 버전)
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId AND p.status = 'PAID' ORDER BY p.createdAt DESC")
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
}
