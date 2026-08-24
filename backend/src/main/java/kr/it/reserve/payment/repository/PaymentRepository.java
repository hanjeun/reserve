package kr.it.reserve.payment.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.payment.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * 환불용 <b>행 잠금</b> 조회 — 2026-08-23 신설. {@code SELECT ... FOR UPDATE} 가 나간다.
     *
     * <h3>왜 필요했나 — 이중 환불</h3>
     * 예전 환불 경로는 이랬다: 결제를 읽고 → 상태가 PAID 인지 보고 → PG 에 취소를 부르고 → 저장.
     * 요청 두 개가 <b>거의 동시에</b> 들어오면 둘 다 "PAID" 를 읽는다. 그러면
     * <b>PG 취소가 두 번 나가고</b>, 나중 저장이 앞의 값을 덮어써 얼마를 돌려줬는지도 사라졌다.
     * (예약 취소 버튼 더블클릭, 모바일에서 네트워크가 느려 재시도 — 흔한 경로다.)
     *
     * <h3>왜 낙관적 락(@Version)이 아니라 비관적 락인가</h3>
     * 낙관적 락은 <b>커밋 시점에</b> 충돌을 알려준다. 그런데 이 경로에서 되돌릴 수 없는 일
     * (= PG 에 실제로 취소 요청을 보내는 것)은 <b>커밋 전에</b> 이미 벌어진다.
     * 두 번째 요청도 PG 를 부른 뒤에야 "버전이 바뀌었네" 하고 실패하므로 <b>이중 환불을 못 막는다.</b>
     * 행을 먼저 잠그면 두 번째 요청은 첫 번째가 끝날 때까지 기다렸다가
     * 바뀐 상태(REFUNDED/REFUND_PENDING)를 보고 <b>PG 를 부르기 전에</b> 거절된다.
     *
     * <p>덤으로 {@code @Version} 컬럼을 새로 만들지 않아도 된다 — {@code ddl-auto: update} 는
     * 컬럼을 추가해줄 뿐 <b>기존 행을 0 으로 채워주지 않아서</b>, 옛 결제 행의 version 이
     * NULL 로 남아 별도 수동 DDL 이 필요해진다. 이 프로젝트는 예약에서도 비관적 락을 쓴다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.id = :id")
    Optional<Payment> findByIdForUpdate(@Param("id") Long id);

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
