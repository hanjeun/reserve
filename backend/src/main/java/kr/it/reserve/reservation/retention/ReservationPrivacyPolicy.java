package kr.it.reserve.reservation.retention;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.reservation.entity.Reservation;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 가게의 일반 조회 기간과 거래 증거의 보유기간을 구분해요. */
public final class ReservationPrivacyPolicy {
    public static final int STORE_DAYS = 30;
    public static final int EVIDENCE_YEARS = 5;
    private ReservationPrivacyPolicy() { }

    public static LocalDateTime usageEnd(Reservation reservation) {
        if (reservation.getUsageEndsAt() != null) return reservation.getUsageEndsAt();
        if (reservation.getReservationDate() == null) return null;
        if (reservation.getReservationTime() == null
                || reservation.getStore() != null && reservation.getStore().resolveBookingType() == kr.it.reserve.store.entity.Store.BookingType.DAY) {
            return reservation.getReservationDate().plusDays(1).atStartOfDay();
        }
        int duration = reservation.getServiceDurationMinutes() == null || reservation.getServiceDurationMinutes() < 1
                ? 60 : reservation.getServiceDurationMinutes();
        return reservation.getReservationDate().atTime(reservation.getReservationTime()).plusMinutes(duration);
    }

    public static LocalDateTime visibleUntil(Reservation reservation) {
        LocalDateTime end = usageEnd(reservation);
        return end == null ? null : end.plusDays(STORE_DAYS);
    }

    public static boolean hidden(Reservation reservation, LocalDateTime nowKst) {
        LocalDateTime until = visibleUntil(reservation);
        return until == null || !nowKst.isBefore(until);
    }

    public static LocalDateTime searchCutoff() { return ServiceTime.now().minusDays(STORE_DAYS); }
    public static LocalDate legacySearchCutoff() { return searchCutoff().toLocalDate(); }
}
