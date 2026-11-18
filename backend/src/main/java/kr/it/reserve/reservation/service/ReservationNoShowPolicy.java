package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import org.springframework.http.HttpStatus;
import java.time.LocalDateTime;

public final class ReservationNoShowPolicy {
    private ReservationNoShowPolicy() { }

    public static LocalDateTime availableAt(Reservation reservation) {
        if (reservation.getReservationDate() == null) return null;
        if (reservation.getUsageEndsAt() != null) return reservation.getUsageEndsAt();
        Store store = reservation.getStore();
        // 이용 종료가 저장되기 전 예약은 예약 방식별로 복원할 수 있는 시각을 사용한다.
        if (store != null && store.resolveBookingType() == Store.BookingType.DAY) {
            return ReservationCompletionPolicy.endsAt(store, reservation.getReservationDate(), null, null);
        }
        if (reservation.getReservationTime() == null) return null;
        return reservation.getReservationDate().atTime(reservation.getReservationTime())
                .plusMinutes(ReservationCompletionPolicy.storedDuration(reservation.getServiceDurationMinutes()));
    }

    public static void requireAvailable(Reservation reservation, LocalDateTime now) {
        LocalDateTime available = availableAt(reservation);
        if (available == null || !available.isBefore(now))
            throw new ReservationException("이용 종료 시각이 지난 뒤 방문 여부를 확인하고 노쇼로 처리해주세요.", HttpStatus.BAD_REQUEST);
    }
}
