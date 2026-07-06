package com.reserve.advertisement.repository;

import com.reserve.advertisement.entity.AdStatus;
import com.reserve.advertisement.entity.AdType;
import com.reserve.advertisement.entity.Advertisement;
import com.reserve.member.entity.Member;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AdvertisementRepository extends JpaRepository<Advertisement, Long> {

    Optional<Advertisement> findByMerchantUid(String merchantUid);

    List<Advertisement> findByStoreOwnerOrderByCreatedAtDesc(Member owner);

    // 노출용 — ACTIVE 상태 + 기간 내, 타입별로 조회 (StoreList 배지 / 배너 위젯)
    List<Advertisement> findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
            AdStatus status, AdType adType, LocalDate today1, LocalDate today2);

    // 만료 스케줄러용 — ACTIVE인데 endDate 지난 것들
    List<Advertisement> findByStatusAndEndDateBefore(AdStatus status, LocalDate date);

    Page<Advertisement> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
