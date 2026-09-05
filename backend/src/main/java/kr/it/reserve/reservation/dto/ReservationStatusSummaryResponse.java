package kr.it.reserve.reservation.dto;

import kr.it.reserve.reservation.entity.Reservation;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 관리자/사업자 예약 대시보드용 전체 상태 집계. 페이지 크기와 무관한 서버 집계다. */
public record ReservationStatusSummaryResponse(
        long total,
        Map<String, Long> statusCounts
) {
    public static ReservationStatusSummaryResponse fromRows(List<Object[]> rows) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Reservation.ReservationStatus status : Reservation.ReservationStatus.values()) {
            counts.put(status.name(), 0L);
        }

        long total = 0;
        for (Object[] row : rows) {
            if (!(row[0] instanceof Reservation.ReservationStatus status)
                    || !(row[1] instanceof Number count)) {
                continue;
            }
            long value = count.longValue();
            counts.put(status.name(), value);
            total += value;
        }
        return new ReservationStatusSummaryResponse(total, Map.copyOf(counts));
    }
}
