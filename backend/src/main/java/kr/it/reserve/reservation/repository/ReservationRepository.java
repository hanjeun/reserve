package kr.it.reserve.reservation.repository;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    /**
     * 특정 회원의 예약 내역 조회 (최신순) - store, member fetch join으로 N+1 방지
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store JOIN FETCH r.member WHERE r.member = :member AND r.deletedAt IS NULL ORDER BY r.createdAt DESC")
    List<Reservation> findByMemberOrderByCreatedAtDesc(@Param("member") Member member);

    /**
     * 특정 가게 소유자의 전체 예약 목록 조회 (최신순) - store, member fetch join으로 N+1 방지
     * ADMIN: 전체 예약, BUSINESS: 본인 가게 예약
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member WHERE s.owner = :owner AND r.deletedAt IS NULL ORDER BY r.createdAt DESC")
    List<Reservation> findByStoreOwnerOrderByCreatedAtDesc(@Param("owner") Member owner);

    /**
     * BUSINESS 전용: 본인 가게 예약 목록 조회 (최신순, 페이지네이션)
     * countQuery 분리로 fetch join + Page 조합 시 발생하는 count 쿼리 오류 방지
     */
    @Query(value = "SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member WHERE s.owner = :owner AND r.deletedAt IS NULL ORDER BY r.createdAt DESC",
           countQuery = "SELECT COUNT(r) FROM Reservation r JOIN r.store s WHERE s.owner = :owner AND r.deletedAt IS NULL")
    Page<Reservation> findByStoreOwnerOrderByCreatedAtDesc(@Param("owner") Member owner, Pageable pageable);

    /**
     * ADMIN 전용: 전체 예약 목록 조회 (최신순, 페이지네이션) - store, member fetch join으로 N+1 방지
     * 소프트 삭제된 예약은 휴지통 탭에서 관리
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store JOIN FETCH r.member WHERE r.deletedAt IS NULL ORDER BY r.createdAt DESC")
    Page<Reservation> findAllWithStoreAndMemberPaged(Pageable pageable);

    /**
     * 가게 상세 페이지 리뷰 작성 가능 여부 판단용: 해당 회원이 이 가게에서 가장 최근에 COMPLETED된 예약 1건 조회
     * (StoreDetail 진입 시 내 전체 예약을 불러와 클라이언트에서 필터링하던 것을 서버 필터로 대체)
     */
    java.util.Optional<Reservation> findFirstByMemberIdAndStoreIdAndStatusOrderByIdDesc(
            Long memberId, Long storeId, Reservation.ReservationStatus status);

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
     * 동시간대 활성 예약 인원 합계 조회 — 특정 예약 1건은 제외한다.
     * 예약 "수정" 시 자기 자신이 이미 그 슬롯의 인원에 포함돼 있어(수정 전 값 기준) 남은 자리 계산에서
     * 자신을 빼지 않으면 인원을 안 늘려도 "마감"으로 잘못 판정될 수 있으므로, excludeReservationId로 자신을 제외한다.
     */
    @Query("SELECT COALESCE(SUM(r.guestCount), 0) FROM Reservation r WHERE r.store.id = :storeId AND r.reservationDate = :date AND r.reservationTime = :time AND r.status IN ('PENDING', 'CONFIRMED') AND r.id <> :excludeReservationId")
    int sumActiveGuestsBySlotExcluding(
            @Param("storeId") Long storeId,
            @Param("date") java.time.LocalDate date,
            @Param("time") java.time.LocalTime time,
            @Param("excludeReservationId") Long excludeReservationId
    );

    /**
     * 날짜별 시간대 선택 UI용: 해당 날짜의 시간대별 활성 예약(PENDING/CONFIRMED) 인원 합계를 한 번에 조회
     * (슬롯마다 sumActiveGuestsBySlot을 반복 호출하는 대신 GROUP BY로 1쿼리)
     * 반환: [reservationTime, guestCountSum] 쌍의 Object[] 리스트
     */
    @Query("SELECT r.reservationTime, SUM(r.guestCount) FROM Reservation r " +
           "WHERE r.store.id = :storeId AND r.reservationDate = :date AND r.status IN ('PENDING', 'CONFIRMED') " +
           "GROUP BY r.reservationTime")
    List<Object[]> sumActiveGuestsGroupedByTime(
            @Param("storeId") Long storeId,
            @Param("date") java.time.LocalDate date
    );


    /**
     * 달력(월 단위)용: 한 달치 활성 예약 인원을 <b>날짜·시각별로 한 번에</b> 조회한다.
     *
     * <p>★ 날짜마다 {@code sumActiveGuestsGroupedByTime} 을 부르면 달력 한 장에 <b>최대 31 쿼리</b>가 된다.
     *   손님이 달을 넘길 때마다 그만큼 나가므로, 목록 화면에서 흔히 나오는 N+1 과 같은 형태다.
     *   {@code BETWEEN} 한 번으로 묶는다.
     *
     * <p>반환: {@code [reservationDate, reservationTime, guestCountSum]}
     */
    @Query("SELECT r.reservationDate, r.reservationTime, SUM(r.guestCount) FROM Reservation r " +
           "WHERE r.store.id = :storeId AND r.reservationDate BETWEEN :from AND :to " +
           "AND r.status IN ('PENDING', 'CONFIRMED') " +
           "GROUP BY r.reservationDate, r.reservationTime")
    List<Object[]> sumActiveGuestsGroupedByDateAndTime(
            @Param("storeId") Long storeId,
            @Param("from") java.time.LocalDate from,
            @Param("to") java.time.LocalDate to
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
     * 중복 예약 방지(수정용): 특정 예약 1건을 제외하고 같은 회원+가게+날짜에 활성 예약이 있는지 확인.
     * 예약 수정 시 자기 자신이 걸려 "이미 예약 존재"로 잘못 막히는 것을 방지한다.
     */
    @Query("SELECT COUNT(r) > 0 FROM Reservation r WHERE r.member.id = :memberId AND r.store.id = :storeId AND r.reservationDate = :date AND r.status IN ('PENDING', 'CONFIRMED') AND r.id <> :excludeReservationId")
    boolean existsActiveReservationByMemberAndStoreAndDateExcluding(
            @Param("memberId") Long memberId,
            @Param("storeId") Long storeId,
            @Param("date") LocalDate date,
            @Param("excludeReservationId") Long excludeReservationId
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
    // 2026-07-29: allowLatePayment 조건을 빠뜨려서 "나중 결제 허용" 가게의 예약까지
    // 30분 뒤 자동 취소되고 있었다(= 그 설정이 사실상 동작하지 않았다).
    // 나중 결제를 허용한 가게는 애초에 결제 없이 예약을 유지하겠다는 뜻이므로 만료 대상에서 제외한다.
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store s JOIN FETCH r.member "
         + "WHERE r.status = 'PENDING' AND r.depositAmount > 0 AND r.depositPaid = false "
         + "AND s.allowLatePayment = false "
         + "AND r.createdAt < :cutoff")
    List<Reservation> findExpiredUnpaidReservations(@Param("cutoff") LocalDateTime cutoff);

    /**
     * 예약 시각이 지났는데 아직 PENDING/CONFIRMED 로 남아 있는 예약 (2026-08-11 신설).
     *
     * <p>{@code ReservationElapsedScheduler} 가 PENDING 은 취소+환불, CONFIRMED 는 UNCONFIRMED 로 넘긴다.
     *
     * <p>⚠️ {@code date}·{@code time} 은 반드시 <b>KST 기준 현재</b>를 넘겨야 한다.
     * 예약 날짜·시각은 이용자에게 보이는 그대로 저장된 KST 값인데, 앱 컨테이너에는 TZ 설정이 없어
     * {@code LocalDateTime.now()} 가 UTC 로 나온다. 그대로 비교하면 9시간이 어긋나
     * 아직 오지 않은 예약을 취소해버린다. (QrCheckinTokenProvider 가 같은 이유로 SERVICE_ZONE 을 쓴다.)
     *
     * <p>정렬은 오래된 것부터 — 배치 상한에 걸려도 가장 오래 방치된 건이 먼저 처리된다.
     */
    @Query("SELECT r FROM Reservation r JOIN FETCH r.store JOIN FETCH r.member "
         + "WHERE r.deletedAt IS NULL AND r.status IN ('PENDING', 'CONFIRMED') "
         + "AND (r.reservationDate < :date "
         + "     OR (r.reservationDate = :date AND r.reservationTime <= :time)) "
         + "ORDER BY r.reservationDate ASC, r.reservationTime ASC")
    List<Reservation> findElapsedActiveReservations(@Param("date") LocalDate date,
                                                    @Param("time") LocalTime time,
                                                    Pageable pageable);

    /**
     * 가게 소프트 삭제 시 PENDING 예약 자동 취소
     */
    @Modifying
    @Query("UPDATE Reservation r SET r.status = 'CANCELLED', r.rejectionReason = '가게 폐업으로 인한 자동 취소' WHERE r.store.id = :storeId AND r.status = 'PENDING' AND r.deletedAt IS NULL")
    int cancelPendingReservationsByStoreId(@Param("storeId") Long storeId);

    @Modifying
    @Query("UPDATE Reservation r SET r.deletedAt = NULL WHERE r.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM Reservation r WHERE r.deletedAt IS NOT NULL AND r.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(LocalDateTime cutoff);

    /**
     * 표시용 예약번호 중복 방지: 생성한 코드가 이미 존재하는지 확인(unique 제약 검사 전 재생성용).
     */
    boolean existsByReservationCode(String reservationCode);

    /**
     * 예약번호 백필용: reservationCode가 아직 없는(null) 예약만 조회.
     * ddl-auto: update로 컬럼이 nullable로 추가된 뒤, 기존 행을 앱 시작 시 1회 채우기 위함.
     */
    List<Reservation> findByReservationCodeIsNull();

    /**
     * 사업자 통계 탭 — 기간 내 일별 예약 건수 추이 (reservationDate 기준 GROUP BY)
     * 반환: [reservationDate, count] 쌍의 Object[] 리스트
     */
    @Query("SELECT r.reservationDate, COUNT(r) FROM Reservation r " +
           "WHERE r.store.id = :storeId AND r.reservationDate BETWEEN :start AND :end AND r.deletedAt IS NULL " +
           "GROUP BY r.reservationDate")
    List<Object[]> countGroupedByDate(@Param("storeId") Long storeId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    /**
     * 사업자 통계 탭 — 기간 내 상태별 건수 분포
     * 반환: [status, count] 쌍의 Object[] 리스트
     */
    @Query("SELECT r.status, COUNT(r) FROM Reservation r " +
           "WHERE r.store.id = :storeId AND r.reservationDate BETWEEN :start AND :end AND r.deletedAt IS NULL " +
           "GROUP BY r.status")
    List<Object[]> countGroupedByStatus(@Param("storeId") Long storeId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    /**
     * 사업자 통계 탭 — 기간 내 일별 예약금 매출(결제 완료건만) 추이
     * 반환: [reservationDate, sum(depositAmount)] 쌍의 Object[] 리스트
     */
    @Query("SELECT r.reservationDate, SUM(r.depositAmount) FROM Reservation r " +
           "WHERE r.store.id = :storeId AND r.depositPaid = true AND r.reservationDate BETWEEN :start AND :end AND r.deletedAt IS NULL " +
           "GROUP BY r.reservationDate")
    List<Object[]> sumDepositGroupedByDate(@Param("storeId") Long storeId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
