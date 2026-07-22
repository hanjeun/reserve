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

    @Query("SELECT a FROM Advertisement a JOIN FETCH a.store WHERE a.deletedAt IS NULL ORDER BY a.createdAt DESC")
    Page<Advertisement> findAllByOrderByCreatedAtDesc(Pageable pageable);

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
