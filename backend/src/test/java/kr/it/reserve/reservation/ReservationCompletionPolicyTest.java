package kr.it.reserve.reservation;

import kr.it.reserve.reservation.service.ReservationCompletionPolicy;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;

class ReservationCompletionPolicyTest {
    @Test void legacyUnsetDurationUsesTheDefaultWithoutAcceptingAnInvalidNewSetting() {
        var store = Store.builder().bookingType(Store.BookingType.SESSION).serviceDurationMinutes(0).build();
        int duration = ReservationCompletionPolicy.storedDuration(store.getServiceDurationMinutes());
        assertThat(duration).isEqualTo(60);
        assertThat(store.getServiceDurationMinutes()).isZero();
        assertThat(ReservationCompletionPolicy.endsAt(store, LocalDate.of(2026,10,27), LocalTime.of(14,0), duration))
                .isEqualTo(LocalDateTime.of(2026,10,27,15,0));
        assertThat(ReservationCompletionPolicy.storedDuration(null)).isEqualTo(60);
        assertThat(ReservationCompletionPolicy.storedDuration(1)).isEqualTo(1);
        assertThat(ReservationCompletionPolicy.storedDuration(1440)).isEqualTo(1440);
        assertThatThrownBy(() -> ReservationCompletionPolicy.duration(0)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> ReservationCompletionPolicy.storedDuration(-1)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> ReservationCompletionPolicy.storedDuration(1441)).isInstanceOf(RuntimeException.class);
    }
    @Test void timedEndUsesSnapshotDurationAcrossMidnight() {
        var store = Store.builder().bookingType(Store.BookingType.SESSION).serviceDurationMinutes(120).build();
        var day = LocalDate.of(2026,10,26);
        assertThat(ReservationCompletionPolicy.endsAt(store, day, LocalTime.of(23,30), 60))
                .isEqualTo(day.plusDays(1).atTime(0,30));
        assertThatThrownBy(() -> ReservationCompletionPolicy.duration(0)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> ReservationCompletionPolicy.duration(1441)).isInstanceOf(RuntimeException.class);
    }
    @Test void dayBookingEndsAtClosingAndLegacyMissingCloseAtMidnight() {
        var store = Store.builder().bookingType(Store.BookingType.DAY).closeTime(LocalTime.of(18,0)).build();
        var day = LocalDate.of(2026,10,26);
        assertThat(ReservationCompletionPolicy.endsAt(store, day, LocalTime.MIDNIGHT, null)).isEqualTo(day.atTime(18,0));
        store.setCloseTime(null);
        assertThat(ReservationCompletionPolicy.endsAt(store, day, LocalTime.MIDNIGHT, null)).isEqualTo(day.plusDays(1).atStartOfDay());
    }
}
