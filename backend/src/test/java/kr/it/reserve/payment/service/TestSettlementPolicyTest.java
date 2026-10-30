package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;

class TestSettlementPolicyTest {
    @Test void onlyPreviousDayNoShowHasEntitlement() {
        LocalDate today = LocalDate.of(2026, 10, 26);
        var reservation = Reservation.builder().reservationDate(today.minusDays(1)).status(Reservation.ReservationStatus.NO_SHOW).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).refundAmount(2000).paidAt(LocalDateTime.now()).build();
        assertThat(TestSettlementPolicy.entitlement(payment, today)).isEqualTo(8000);
        reservation.setReservationDate(today);
        assertThat(TestSettlementPolicy.entitlement(payment, today)).isZero();
        reservation.setReservationDate(today.minusDays(1));
        reservation.setCheckedInAt(LocalDateTime.now());
        assertThat(TestSettlementPolicy.entitlement(payment, today)).isZero();
        reservation.setCheckedInAt(null); reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
        assertThat(TestSettlementPolicy.entitlement(payment, today)).isZero();
    }
    @Test void liveUnknownDisputeAndUnresolvedRefundAreHeld() {
        var payment = Payment.builder().status(Payment.PaymentStatus.PAID).verifiedChannelId("test-channel").verifiedChannelType("TEST").verifiedDisputed(false).build();
        assertThat(TestSettlementPolicy.held(payment, false)).isFalse();
        assertThat(TestSettlementPolicy.held(payment, true)).isTrue();
        payment.setVerifiedChannelType("LIVE");
        assertThat(TestSettlementPolicy.held(payment, false)).isTrue();
        payment.setVerifiedChannelType("TEST"); payment.setVerifiedDisputed(null);
        assertThat(TestSettlementPolicy.held(payment, false)).isTrue();
        payment.setVerifiedDisputed(false); payment.setStatus(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(TestSettlementPolicy.held(payment, false)).isTrue();
    }
    @Test void aLaterRefundLeavesSignedAdjustmentBalance() {
        var reservation = Reservation.builder().reservationDate(LocalDate.now().minusDays(1)).status(Reservation.ReservationStatus.NO_SHOW).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).refundAmount(10000).paidAt(LocalDateTime.now()).build();
        assertThat(TestSettlementPolicy.entitlement(payment, LocalDate.now()) - 10000L).isEqualTo(-10000L);
    }
}
