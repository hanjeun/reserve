package kr.it.reserve.advertisement.repository;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.member.entity.Member;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AdvertisementRepository extends JpaRepository<Advertisement, Long> {

    Optional<Advertisement> findByMerchantUid(String merchantUid);

    // 2026-07 추가: 종료상태(만료/취소/환불/중단) 광고를 사업자가 직접 목록에서 숨길 수 있게(소프트삭제)
    // 되면서, 데리베이션 쿼리로는 WHERE를 추가할 수 없어 명시적 @Query로 바꿈 —
    // 예약(ReservationRepository)의 동일한 패턴.
    @Query("SELECT a FROM Advertisement a JOIN FETCH a.store WHERE a.store.owner = :owner AND a.deletedAt IS NULL ORDER BY a.createdAt DESC")
    List<Advertisement> findByStoreOwnerOrderByCreatedAtDesc(@Param("owner") Member owner);

    // 노출용 — ACTIVE 상태 + 기간 내, 타입별로 조회 (StoreList 배지 / 배너 위젯)
    // 배너는 AdBanner.jsx가 첫 원소(ads[0])만 보여주므로, 여러 건이 동시에 ACTIVE일 때 가장 최근에
    // 결제한 광고가 노출되도록 OrderByCreatedAtDesc 필수(2026-07 버그 수정 — 예전엔 정렬 없이 DB 기본순(PK순)로
    // 나와서 가장 먼저 결제한 광고 하나가 만료될 때까지 계속 독점하고, 다른 사업자가 동시에 결제한 배너는 한 번도
    // 노출되지 못하는 문제가 있었다)
    List<Advertisement> findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAtDesc(
            AdStatus status, AdType adType, LocalDate today1, LocalDate today2);

    // 중복 신청 방지용(2026-07 추가) — 같은 가게+타입으로 결제 대기/실패 상태인 신청이 이미 있는지 확인
    Optional<Advertisement> findFirstByStoreIdAndAdTypeAndStatusIn(Long storeId, AdType adType, List<AdStatus> statuses);

    // 만료 스케줄러용 — ACTIVE인데 endDate 지난 것들
    List<Advertisement> findByStatusAndEndDateBefore(AdStatus status, LocalDate date);

    /**
     * 결제되지 않은 채 <b>노출 시작일이 지나버린</b> 광고. 자동 취소 대상이다.
     *
     * <p>{@code PENDING_PAYMENT}(결제창을 닫았거나 이탈)와 {@code PAYMENT_FAILED} 둘 다 본다 —
     * 사용자 입장에선 "아직 돈을 안 낸 신청"으로 똑같고, 둘 다 재결제 버튼이 붙기 때문이다.
     */
    List<Advertisement> findByStatusInAndStartDateBefore(java.util.Collection<AdStatus> statuses, LocalDate date);

    @Query("SELECT a FROM Advertisement a JOIN FETCH a.store WHERE a.deletedAt IS NULL ORDER BY a.createdAt DESC")
    Page<Advertisement> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * 관리자 광고 목록 — 가게 이름 검색 포함.
     *
     * <p><b>왜 필요한가:</b> 예전에는 이 목록을 서버에서 페이지 단위로 받아온 뒤
     * 프론트(AdminAdsTab)가 {@code Array.filter}로 걸렀다. 그래서 <b>검색이 현재 페이지 안에서만</b>
     * 동작했다 — 2페이지에 있는 광고는 1페이지에서 검색해도 나오지 않는다.
     * 데이터가 늘수록 "분명 있는데 검색이 안 된다"가 되므로 검색을 서버로 옮겼다.
     *
     * <p><b>keyword가 NULL 검사 대신 빈 문자열인 이유:</b>
     * {@code (:keyword IS NULL OR ...)} 형태는 Hibernate 6에서 파라미터 타입 추론이 필요해
     * 상황에 따라 캐스팅을 요구한다. 빈 문자열이면 {@code LIKE '%%'}가 되어 전건 매칭이므로
     * 분기 자체가 사라진다. 서비스에서 null을 빈 문자열로 정규화해 넘긴다.
     *
     * <p><b>countQuery를 직접 준 이유:</b> 본 쿼리에 {@code JOIN FETCH}가 있어 Spring Data가
     * 파생시키는 count 쿼리에도 fetch가 섞이면 실패할 수 있다. count에는 fetch 없는 일반 join을 쓴다.
     * ({@code a.store}는 ToOne이라 fetch join + 페이징을 해도 메모리 페이징으로 떨어지지 않는다 —
     *  컬렉션 fetch join이었다면 HHH000104 경고와 함께 전건 로딩이 됐을 것이다)
     *
     * <p>⚠️ 이 검색도 {@code LIKE '%kw%'}라 인덱스를 타지 못한다. 광고는 건수가 적어 당장은
     * 문제가 없지만, 가게 검색(StoreRepository)처럼 커지면 FULLTEXT로 옮겨야 한다.
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

    // 사업자 통계 탭 — 현재 활성(ACTIVE) 광고 요약용, 종료일 가까운 순으로 1건만
    Optional<Advertisement> findFirstByStoreIdAndStatusOrderByEndDateDesc(Long storeId, AdStatus status);

    // 광고 성과 카운터 버퍼 flush 전용(2026-07 추가) — AdCounterFlushScheduler가 주기적으로 호출한다.
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
