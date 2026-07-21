package kr.it.reserve.store.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 사업자 "통계 · 분석" 탭 응답 DTO.
 * range(7d/30d/90d) 기간 동안의 예약 추이/상태 분포/매출 추이 + 평점 + 광고 노출 현황.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoreStatisticsResponse {

    private List<DailyValue> reservationTrend;   // 일별 예약 건수 추이
    private Map<String, Long> statusBreakdown;   // 상태별 건수 (PENDING/CONFIRMED/COMPLETED/...)
    private Double averageRating;                // Store.rating (denormalized)
    private Integer reviewCount;                 // Store.reviewCount (denormalized)
    private List<DailyValue> revenueTrend;       // 일별 예약금 매출 추이
    private Long totalDepositRevenue;            // 기간 내 예약금 매출 합계
    private AdSummary adSummary;                 // 현재 활성 광고 요약 (없으면 null)

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyValue {
        private String date;   // yyyy-MM-dd
        private long value;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdSummary {
        private String adType;         // BADGE | BANNER
        private String status;         // ACTIVE
        private Integer daysRemaining; // 오늘 기준 종료일까지 남은 일수

        // 광고 성과 지표(2026-07 추가) — 누적 카운터(일별 추이 아님, 현 구조 한계).
        // ctr/conversionRate은 분모가 0이면 null("집계 불가"와 "0%"를 구분하기 위해 엔티티가 직접 계산).
        private Integer impressionCount;
        private Integer clickCount;
        private Integer conversionCount;
        private Double clickThroughRate;
        private Double conversionRate;
    }
}
