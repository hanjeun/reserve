package kr.it.reserve.reservation;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationNoShowPolicy;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;

class ReservationNoShowPolicyTest {
    @Test void timeReservationMustPassItsPromisedEnd() {
        LocalDateTime start = LocalDateTime.of(2026, 11, 4, 12, 0);
        LocalDateTime end = start.plusMinutes(90);
        var reservation = Reservation.builder().reservationDate(start.toLocalDate()).reservationTime(start.toLocalTime())
                .usageEndsAt(end).build();
        assertThatThrownBy(() -> ReservationNoShowPolicy.requireAvailable(reservation, start.minusNanos(1))).isInstanceOf(ReservationException.class);
        assertThatThrownBy(() -> ReservationNoShowPolicy.requireAvailable(reservation, end)).isInstanceOf(ReservationException.class);
        assertThatCode(() -> ReservationNoShowPolicy.requireAvailable(reservation, end.plusNanos(1))).doesNotThrowAnyException();
    }

    @Test void anOvernightDayReservationCannotBecomeNoShowAtMidnight() {
        var store = Store.builder().bookingType(Store.BookingType.DAY).openTime(LocalTime.of(22, 0)).closeTime(LocalTime.of(6, 0)).build();
        var reservation = Reservation.builder().store(store).reservationDate(LocalDate.of(2026, 11, 4)).reservationTime(LocalTime.MIDNIGHT).build();
        LocalDateTime closing = LocalDateTime.of(2026, 11, 5, 6, 0);
        assertThat(ReservationNoShowPolicy.availableAt(reservation)).isEqualTo(closing);
        assertThatThrownBy(() -> ReservationNoShowPolicy.requireAvailable(reservation, closing.minusHours(1))).isInstanceOf(ReservationException.class);
        assertThatCode(() -> ReservationNoShowPolicy.requireAvailable(reservation, closing.plusSeconds(1))).doesNotThrowAnyException();
    }

    @Test void dayReservationKeepsTheEndTimePromisedBeforeTheStoreChanged() {
        var promised = LocalDateTime.of(2026, 11, 4, 21, 0);
        var reservation = Reservation.builder().store(Store.builder().bookingType(Store.BookingType.DAY).closeTime(LocalTime.NOON).build())
                .reservationDate(promised.toLocalDate()).usageEndsAt(promised).build();
        assertThat(ReservationNoShowPolicy.availableAt(reservation)).isEqualTo(promised);
    }

    @Test void missingReservationTimeFailsClosed() {
        var reservation = Reservation.builder().reservationDate(LocalDate.of(2026, 11, 4)).build();
        assertThatThrownBy(() -> ReservationNoShowPolicy.requireAvailable(reservation, LocalDateTime.of(2026, 11, 5, 0, 0)))
                .isInstanceOf(ReservationException.class);
    }
}
