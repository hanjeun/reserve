package kr.it.reserve.store.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.dto.StoreStatisticsResponse;
import kr.it.reserve.store.entity.Store;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read-only statistics; authorization and aggregation stay together under the facade transaction. */
final class StoreStatistics {
    private final StoreRepository storeRepository;
    private final ReservationRepository reservationRepository;
    private final PaymentRepository paymentRepository;
    private final AdvertisementRepository advertisementRepository;
    StoreStatistics(StoreRepository stores, ReservationRepository reservations,
                    PaymentRepository payments, AdvertisementRepository ads) {
        storeRepository = stores;
        reservationRepository = reservations;
        paymentRepository = payments;
        advertisementRepository = ads;
    }

    public StoreStatisticsResponse getStoreStatistics(Long storeId, Member member, String range) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(StoreException::notFound);
        boolean isAdmin = member.isAdmin();
        boolean isOwner = store.getOwner() != null && store.getOwner().getId().equals(member.getId());
        if (!isAdmin && !isOwner) {
            throw StoreException.forbidden("통계를 조회할 권한이 없어요.");
        }

        int days = switch (range == null ? "30d" : range) {
            case "7d" -> 7;
            case "90d" -> 90;
            default -> 30;
        };
        LocalDate end = ServiceTime.today();
        LocalDate start = end.minusDays(days - 1L);

        // 예약 추이 — 데이터 없는 날짜도 0건으로 빈칸 없이 채운다(차트가 중간에 끓기지 않게)
        Map<LocalDate, Long> countMap = new HashMap<>();
        for (Object[] row : reservationRepository.countGroupedByDate(storeId, start, end)) {
            countMap.put((LocalDate) row[0], (Long) row[1]);
        }
        List<StoreStatisticsResponse.DailyValue> reservationTrend = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            reservationTrend.add(StoreStatisticsResponse.DailyValue.builder()
                    .date(d.toString()).value(countMap.getOrDefault(d, 0L)).build());
        }

        // 상태별 분포
        Map<String, Long> statusBreakdown = new LinkedHashMap<>();
        for (Object[] row : reservationRepository.countGroupedByStatus(storeId, start, end)) {
            statusBreakdown.put(row[0].toString(), (Long) row[1]);
        }

        // 예약금 순결제액 추이. 결제 완료일 기준이며 확정 환불액은 차감한다.
        Map<LocalDate, Long> revenueMap = new HashMap<>();
        for (Object[] row : paymentRepository.sumNetDepositByPaidDate(
                storeId, start.atStartOfDay(), end.plusDays(1).atStartOfDay())) {
            revenueMap.put((LocalDate) row[0], row[1] != null ? ((Number) row[1]).longValue() : 0L);
        }
        List<StoreStatisticsResponse.DailyValue> revenueTrend = new ArrayList<>();
        long totalRevenue = 0L;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            long v = revenueMap.getOrDefault(d, 0L);
            totalRevenue += v;
            revenueTrend.add(StoreStatisticsResponse.DailyValue.builder().date(d.toString()).value(v).build());
        }

        // 현재 활성 광고 요약 (없으면 null)
        LocalDate today = ServiceTime.today();
        StoreStatisticsResponse.AdSummary adSummary = advertisementRepository
                .findFirstByStoreIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateAscIdAsc(
                        storeId, AdStatus.ACTIVE, today, today)
                .map(ad -> StoreStatisticsResponse.AdSummary.builder()
                        .adType(ad.getAdType().name())
                        .status(ad.getStatus().name())
                        .daysRemaining((int) ChronoUnit.DAYS.between(today, ad.getEndDate()))
                        .impressionCount(ad.getImpressionCount())
                        .clickCount(ad.getClickCount())
                        .conversionCount(ad.getConversionCount())
                        .clickThroughRate(ad.getClickThroughRate())
                        .conversionRate(ad.getConversionRate())
                        .build())
                .orElse(null);

        return StoreStatisticsResponse.builder()
                .reservationTrend(reservationTrend)
                .statusBreakdown(statusBreakdown)
                .averageRating(store.getRating())
                .reviewCount(store.getReviewCount())
                .revenueTrend(revenueTrend)
                .totalDepositRevenue(totalRevenue)
                .adSummary(adSummary)
                .build();
    }
}
