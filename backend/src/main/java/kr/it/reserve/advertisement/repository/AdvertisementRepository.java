package kr.it.reserve.advertisement.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.member.entity.Member;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AdvertisementRepository extends JpaRepository<Advertisement, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Advertisement a WHERE a.id = :id")
    Optional<Advertisement> findByIdForUpdate(@Param("id") Long id);

    @Query("SELECT a.store.id FROM Advertisement a WHERE a.id = :id")
    Optional<Long> findStoreId(@Param("id") Long id);

    @Query("SELECT a.id FROM Advertisement a WHERE NOT EXISTS "
            + "(SELECT p.id FROM AdPaymentAttempt p WHERE p.merchantUid = a.merchantUid) ORDER BY a.id")
    List<Long> findWithoutPaymentAttempt(Pageable pageable);

    @Query("SELECT COUNT(a) FROM Advertisement a WHERE a.store.id = :storeId AND NOT EXISTS "
            + "(SELECT p.id FROM AdPaymentAttempt p WHERE p.merchantUid = a.merchantUid)")
    long countUntrackedByStoreId(@Param("storeId") Long storeId);

    @Query("SELECT COUNT(a) FROM Advertisement a WHERE a.store.owner.id = :ownerId AND NOT EXISTS "
            + "(SELECT p.id FROM AdPaymentAttempt p WHERE p.merchantUid = a.merchantUid)")
    long countUntrackedByOwnerId(@Param("ownerId") Long ownerId);

    Optional<Advertisement> findByMerchantUid(String merchantUid);
    @Query("SELECT a.id FROM Advertisement a WHERE a.merchantUid = :uid")
    Optional<Long> findIdByMerchantUid(@Param("uid") String uid);
    List<Advertisement> findByStoreId(Long storeId);

    // 2026-07 추가: 종료상태(만료/취소/환불/중단) 광고를 사업자가 직접 목록에서 숨길 수 있게(소프트삭제)
    // 되면서, 데리베이션 쿼리로는 WHERE를 추가할 수 없어 명시적 @Query로 바꿈 —
    // 예약(ReservationRepository)의 동일한 패턴.
    @Query(value = "SELECT a FROM Advertisement a JOIN FETCH a.store s "
                 + "WHERE s.owner = :owner AND a.deletedAt IS NULL "
                 + "AND (:storeId = 0 OR s.id = :storeId) "
                 + "AND LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!' "
                 + "ORDER BY a.createdAt DESC, a.id DESC",
           countQuery = "SELECT COUNT(a) FROM Advertisement a JOIN a.store s "
                      + "WHERE s.owner = :owner AND a.deletedAt IS NULL "
                      + "AND (:storeId = 0 OR s.id = :storeId) "
                      + "AND LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'")
    Page<Advertisement> findMyAds(
            @Param("owner") Member owner,
            @Param("storeId") long storeId,
            @Param("keyword") String keyword,
            Pageable pageable);

    // 노출용 — ACTIVE 상태 + 기간 내, 타입별로 조회 (StoreList 배지 / 배너 위젯)
    // 배너는 AdBanner.jsx가 첫 원소(ads[0])만 보여주므로, 여러 건이 동시에 ACTIVE일 때 가장 최근에
    // 결제한 광고가 노출되도록 OrderByCreatedAtDesc 필수(2026-07 버그 수정 — 예전엔 정렬 없이 DB 기본순(PK순)로
    // 나와서 가장 먼저 결제한 광고 하나가 만료될 때까지 계속 독점하고, 다른 사업자가 동시에 결제한 배너는 한 번도
    // 노출되지 못하는 문제가 있었다)
    List<Advertisement> findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAtDesc(
            AdStatus status, AdType adType, LocalDate today1, LocalDate today2);

    // 중복 신청 방지용 — 같은 가게+타입으로 결제 대기/실패 상태인 신청이 이미 있는지 확인
    Optional<Advertisement> findFirstByStoreIdAndAdTypeAndStatusInAndStartDateGreaterThanEqual(
            Long storeId, AdType adType, List<AdStatus> statuses, LocalDate earliestStartDate);

    long countByStoreIdAndStatusInAndDeletedAtIsNull(Long storeId, Collection<AdStatus> statuses);

    // 만료 스케줄러용 — ACTIVE인데 endDate 지난 것들
    List<Advertisement> findByStatusAndEndDateBefore(AdStatus status, LocalDate date);

    /**
     * 결제되지 않은 채 <b>노출 시작일이 지나버린</b> 광고. 자동 취소 대상이다.
     *
     * <p>{@code PENDING_PAYMENT}(결제창을 닫았거나 이탈)와 {@code PAYMENT_FAILED} 둘 다 본다 —
     * 사용자 입장에선 "아직 돈을 안 낸 신청"으로 똑같고, 둘 다 재결제 버튼이 붙기 때문이다.
     */
    List<Advertisement> findByStatusInAndStartDateBefore(Collection<AdStatus> statuses, LocalDate date);

    @Query("SELECT a FROM Advertisement a JOIN FETCH a.store WHERE a.deletedAt IS NULL ORDER BY a.createdAt DESC")
    Page<Advertisement> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * 가게 이름 검색을 포함한 관리자 광고 페이지를 조회한다.
     * 서비스에서 null 검색어를 빈 문자열로 정규화하며 빈 검색어는 전체 이름에 대응한다.
     * ToOne fetch 조회와 별도로 fetch 없는 count 쿼리를 사용한다.
     * 부분 일치 LIKE 검색의 비용은 데이터 규모가 늘면 별도로 점검해야 한다.
     */
    @Query(value = "SELECT a FROM Advertisement a JOIN FETCH a.store s "
                 + "WHERE a.deletedAt IS NULL "
                 + "AND LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) "
                 + "ORDER BY a.createdAt DESC",
           countQuery = "SELECT COUNT(a) FROM Advertisement a JOIN a.store s "
                      + "WHERE a.deletedAt IS NULL "
                      + "AND LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    Page<Advertisement> searchForAdmin(@Param("keyword") String keyword, Pageable pageable);

    @Modifying
    @Query("UPDATE Advertisement a SET a.deletedAt = NULL WHERE a.id = :id")
    void restoreById(@Param("id") Long id);

    // 사업자 통계 탭 — 상태뿐 아니라 실제 날짜 범위도 확인하고, 종료일 가까운 순으로 1건만 고른다.
    Optional<Advertisement>
    findFirstByStoreIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateAscIdAsc(
            Long storeId, AdStatus status, LocalDate startBoundary, LocalDate endBoundary);

    // 광고 성과 카운터 버퍼 flush 전용 — AdCounterFlushScheduler가 주기적으로 호출한다.
    // 엔티티를 findById로 읽어서 dirty checking으로 저장하는 대신, DB 레벨에서 바로
    // "현재값 + delta"로 갱신해서 SELECT 없이 UPDATE 한 번으로 끝낸다.
    @Modifying
    @Query("UPDATE Advertisement a SET a.impressionCount = a.impressionCount + :delta WHERE a.id = :id")
    void addImpressionCount(@Param("id") Long id, @Param("delta") long delta);

    @Modifying
    @Query("UPDATE Advertisement a SET a.clickCount = a.clickCount + :delta WHERE a.id = :id")
    void addClickCount(@Param("id") Long id, @Param("delta") long delta);

    @Modifying
    @Query("UPDATE Advertisement a SET a.conversionCount = a.conversionCount + :delta WHERE a.id = :id")
    void addConversionCount(@Param("id") Long id, @Param("delta") long delta);
}
