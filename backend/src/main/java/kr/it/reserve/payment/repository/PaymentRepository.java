package kr.it.reserve.payment.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation.ReservationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    String CONFIRMED_DEPOSIT_PAYMENT = """
            p.paidAt IS NOT NULL
            AND p.status IN ('PAID', 'PARTIAL_REFUNDED', 'REFUND_PENDING', 'REFUNDED')
            """;

    // COUNT와 관리자 목록은 같은 판정을 공유한다. 숨긴 예약도 금융 대사에서 제외하지 않는다.
    String RESERVATION_DEPOSIT_INVARIANT_PREDICATE = """
            (r.depositPaid = true AND NOT EXISTS (
                SELECT p.id FROM Payment p WHERE p.reservation = r AND
            """ + CONFIRMED_DEPOSIT_PAYMENT + """
                AND p.amount - COALESCE(p.refundAmount, 0) > 0))
            OR ((r.depositPaid = false OR r.depositPaid IS NULL) AND EXISTS (
                SELECT p.id FROM Payment p WHERE p.reservation = r AND
            """ + CONFIRMED_DEPOSIT_PAYMENT + """
                AND p.amount - COALESCE(p.refundAmount, 0) > 0))
            """;
    
    // 가맹점 주문번호로 조회
    Optional<Payment> findByMerchantUid(String merchantUid);

    @Query("SELECT p.reservation.id FROM Payment p WHERE p.id = :id")
    Optional<Long> findReservationIdByPaymentId(@Param("id") Long id);

    @Query("SELECT p.reservation.id FROM Payment p WHERE p.merchantUid = :merchantUid")
    Optional<Long> findReservationIdByMerchantUid(@Param("merchantUid") String merchantUid);

    /** 브라우저 검증·웹훅·만료 재확인이 같은 결제를 동시에 완료하지 않도록 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.merchantUid = :merchantUid")
    Optional<Payment> findByMerchantUidForUpdate(@Param("merchantUid") String merchantUid);
    
    // 포트원 결제번호로 조회
    Optional<Payment> findByImpUid(String impUid);
    
    // 예약 ID로 조회 (단일 - 주의: 레코드 여러 개면 예외 발생)
    Optional<Payment> findByReservationId(Long reservationId);
    boolean existsByReservationId(Long reservationId);

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

    /**
     * 환불 준비·발신 선점·결말 반영의 공통 행 잠금이다.
     * 미결 원장과 REFUND_PENDING을 커밋한 뒤에만 PG를 호출하며, 네트워크 대기 중 이 잠금은 유지하지 않는다.
     * 낙관적 충돌 검출에 앞서 외부 취소가 중복 발신되는 것을 막기 위해 단일 선점을 먼저 확정한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.id = :id")
    Optional<Payment> findByIdForUpdate(@Param("id") Long id);

    /**
     * 예약 만료 재확인용. 한 예약의 결제 행을 한 스냅샷에서 모두 잠가
     * READY→PAID 전환과 만료 취소가 서로 엇갈리지 않게 한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId ORDER BY p.createdAt DESC")
    List<Payment> findAllByReservationIdForUpdate(@Param("reservationId") Long reservationId);

    /**
     * 위와 같은 잠금 조회를 예약 ID 로. 조건·정렬·LIMIT 은 {@link #findPaidByReservationId} 와 같다
     * — 두 메서드가 <b>다른 행을 고르면</b> 잠금이 의미를 잃으므로 바꿀 때 반드시 같이 바꿀 것.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId AND p.status = 'PAID' ORDER BY p.createdAt DESC LIMIT 1")
    Optional<Payment> findPaidByReservationIdForUpdate(@Param("reservationId") Long reservationId);

    // 예약 ID + READY 상태로 가장 최근 조회 (결제창 재시도용)
    @Query("SELECT p FROM Payment p WHERE p.reservation.id = :reservationId AND p.status = 'READY' ORDER BY p.createdAt DESC")
    List<Payment> findReadyByReservationId(@Param("reservationId") Long reservationId);
    
    // 회원 ID로 결제 목록 조회
    List<Payment> findByMemberIdOrderByCreatedAtDesc(Long memberId);
    
    // 결제 상태로 조회
    List<Payment> findByStatus(Payment.PaymentStatus status);

    /** 관리자 수동 대사용 오래된 READY 목록. 예약은 DTO 변환 시 필요한 ToOne이라 fetch join해 N+1을 막는다. */
    @Query(value = """
            SELECT p FROM Payment p
              JOIN FETCH p.reservation r
             WHERE p.status = 'READY' AND p.createdAt < :cutoff
             ORDER BY p.createdAt ASC, p.id ASC
            """,
            countQuery = """
            SELECT COUNT(p) FROM Payment p
             WHERE p.status = 'READY' AND p.createdAt < :cutoff
            """)
    Page<Payment> findStaleReadyPayments(
            @Param("cutoff") LocalDateTime cutoff,
            Pageable pageable);

    long countByStatusAndCreatedAtBefore(Payment.PaymentStatus status, LocalDateTime cutoff);

    /**
     * 사업자 통계용 일별 예약금 순결제액.
     *
     * <p>예약 방문일이나 {@code reservation.depositPaid}가 아니라 실제 결제 완료 시각을 쓴다.
     * 확정 환불액만 차감하므로 {@code REFUND_PENDING}은 돈이 돌아오기 전까지 기존 순액을 유지한다.
     * 숨긴 예약도 금융 원장에서는 사라지면 안 되므로 {@code deletedAt} 조건을 두지 않는다.
     */
    @Query("""
            SELECT CAST(p.paidAt AS LocalDate), SUM(p.amount - COALESCE(p.refundAmount, 0))
              FROM Payment p
             WHERE p.reservation.store.id = :storeId
               AND p.paidAt >= :startInclusive
               AND p.paidAt < :endExclusive
               AND p.status IN ('PAID', 'PARTIAL_REFUNDED', 'REFUND_PENDING', 'REFUNDED')
             GROUP BY CAST(p.paidAt AS LocalDate)
             ORDER BY CAST(p.paidAt AS LocalDate)
            """)
    List<Object[]> sumNetDepositByPaidDate(
            @Param("storeId") Long storeId,
            @Param("startInclusive") LocalDateTime startInclusive,
            @Param("endExclusive") LocalDateTime endExclusive);

    /** 결제 상태·금액·확정 환불액 사이의 장부 불변식 위반 건수. 자동 보정하지 않는다. */
    @Query("""
            SELECT COUNT(p) FROM Payment p
             WHERE p.amount IS NULL OR p.amount <= 0
                OR COALESCE(p.refundAmount, 0) < 0
                OR COALESCE(p.refundAmount, 0) > p.amount
                OR (p.status IN ('PAID', 'PARTIAL_REFUNDED', 'REFUND_PENDING', 'REFUNDED')
                    AND p.paidAt IS NULL)
                OR (p.status IN ('READY', 'FAILED', 'CANCELLED')
                    AND (p.paidAt IS NOT NULL OR COALESCE(p.refundAmount, 0) <> 0))
                OR (p.status = 'PAID' AND COALESCE(p.refundAmount, 0) <> 0)
                OR (p.status = 'PARTIAL_REFUNDED'
                    AND (COALESCE(p.refundAmount, 0) <= 0 OR p.refundAmount >= p.amount))
                OR (p.status = 'REFUNDED' AND COALESCE(p.refundAmount, 0) < p.amount)
            """)
    long countLedgerInvariantViolations();

    /** 예약의 결제 플래그와 결제 원장의 확정 순잔액이 어긋난 건수. 자동 보정하지 않는다. */
    @Query("SELECT COUNT(r) FROM Reservation r WHERE " + RESERVATION_DEPOSIT_INVARIANT_PREDICATE)
    long countReservationDepositInvariantViolations();

    /** 집계와 동일한 불변식 대상만 읽는다. 개인정보·주문번호·PG 식별자는 조회하지 않는다. */
    @Query(value = """
            SELECT r.id AS reservationId, r.store.id AS storeId,
                   r.status AS reservationStatus, r.depositPaid AS depositPaid,
                   r.deletedAt AS reservationDeletedAt
              FROM Reservation r WHERE
            """ + RESERVATION_DEPOSIT_INVARIANT_PREDICATE + " ORDER BY r.id ASC",
            countQuery = "SELECT COUNT(r) FROM Reservation r WHERE " + RESERVATION_DEPOSIT_INVARIANT_PREDICATE)
    Page<DepositInvariantReservation> findReservationDepositInvariantViolations(Pageable pageable);

    /** 페이지에 포함된 예약의 확정 원장만 상태별로 묶어 한 번에 읽는다. PG 호출·잠금·수정 없음. */
    @Query("""
            SELECT p.reservation.id AS reservationId, p.status AS paymentStatus,
                   COUNT(p) AS paymentCount,
                   SUM(COALESCE(p.amount, 0) - COALESCE(p.refundAmount, 0)) AS confirmedNetAmount,
                   SUM(COALESCE(p.refundAmount, 0)) AS confirmedRefundAmount,
                   SUM(CASE WHEN p.amount - COALESCE(p.refundAmount, 0) > 0 THEN 1 ELSE 0 END) AS positiveBalancePaymentCount
              FROM Payment p WHERE p.reservation.id IN :reservationIds AND
            """ + CONFIRMED_DEPOSIT_PAYMENT + " GROUP BY p.reservation.id, p.status ORDER BY p.reservation.id, p.status")
    List<DepositInvariantLedgerSummary> summarizeConfirmedDepositLedger(
            @Param("reservationIds") List<Long> reservationIds);

    interface DepositInvariantReservation {
        Long getReservationId();
        Long getStoreId();
        ReservationStatus getReservationStatus();
        Boolean getDepositPaid();
        LocalDateTime getReservationDeletedAt();
    }

    interface DepositInvariantLedgerSummary {
        Long getReservationId();
        Payment.PaymentStatus getPaymentStatus();
        Long getPaymentCount();
        Long getConfirmedNetAmount();
        Long getConfirmedRefundAmount();
        Long getPositiveBalancePaymentCount();
    }
    
    // 회원 ID와 결제 상태로 조회
    List<Payment> findByMemberIdAndStatus(Long memberId, Payment.PaymentStatus status);
    
    // 가게 ID로 결제 목록 조회 (사업자용)
    @Query("SELECT p FROM Payment p JOIN p.reservation r WHERE r.store.id = :storeId ORDER BY p.createdAt DESC")
    List<Payment> findByStoreId(@Param("storeId") Long storeId);

    /** 탈퇴 시 주문번호·금액·상태는 보존하고 중복 저장된 구매자 식별자만 제거한다. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE Payment p SET p.buyerName = '탈퇴한 회원', p.buyerEmail = NULL, p.buyerTel = NULL " +
           "WHERE p.member.id = :memberId")
    int anonymizeBuyerByMemberId(@Param("memberId") Long memberId);

    /** 탈퇴의 회원 잠금 뒤 current read한다. EXISTS 하위 쿼리의 옛 snapshot을 사용하지 않는다. */
    @Query(value = """
            SELECT p.payment_id FROM payment p
              LEFT JOIN refund_attempt ra ON ra.payment_id = p.payment_id
             WHERE p.member_id = :memberId
               AND (p.status = 'REFUND_PENDING' OR ra.status IN ('REQUESTED', 'PENDING'))
             ORDER BY p.payment_id, ra.refund_attempt_id
             FOR UPDATE
            """, nativeQuery = true)
    List<Long> findUnresolvedRefundPaymentIdsForUpdate(@Param("memberId") Long memberId);
}
