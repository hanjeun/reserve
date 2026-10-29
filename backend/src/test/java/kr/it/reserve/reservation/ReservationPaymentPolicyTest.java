package kr.it.reserve.reservation;

import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationPaymentPolicy;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;

class ReservationPaymentPolicyTest {
    @Test void deadlineIsInclusiveAndMatchesConfiguredServerClock() {
        var at = LocalDateTime.of(2026, 10, 27, 12, 0);
        var reservation = Reservation.builder().store(Store.builder().paymentTimeoutMinutes(10).build())
                .status(Reservation.ReservationStatus.PENDING).depositAmount(10000).depositPaid(false).createdAt(at).build();
        assertThat(ReservationPaymentPolicy.deadline(reservation)).isEqualTo(at.plusMinutes(10));
        assertThat(ReservationPaymentPolicy.expiredAt(reservation, at.plusMinutes(10).minusNanos(1))).isFalse();
        assertThat(ReservationPaymentPolicy.expiredAt(reservation, at.plusMinutes(10))).isTrue();
        assertThat(ReservationPaymentPolicy.expiredAt(reservation, at.plusMinutes(11))).isTrue();
        reservation.getStore().setPaymentTimeoutMinutes(null);
        assertThat(ReservationPaymentPolicy.deadline(reservation)).isEqualTo(at.plusMinutes(30));
        reservation.getStore().setPaymentTimeoutMinutes(0);
        assertThat(ReservationPaymentPolicy.deadline(reservation)).isNull();
        reservation.getStore().setPaymentTimeoutMinutes(10);
        reservation.getStore().setAllowLatePayment(true);
        assertThat(ReservationPaymentPolicy.deadline(reservation)).isNull();
        assertThat(ReservationPaymentPolicy.requiresAdvancePayment(reservation)).isFalse();
    }
}
