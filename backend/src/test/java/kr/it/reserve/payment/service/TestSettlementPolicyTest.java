package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import static org.assertj.core.api.Assertions.*;

class TestSettlementPolicyTest {
    @Test void onlyPreviousDayNoShowHasEntitlement() {
        LocalDate today = LocalDate.of(2026, 10, 26);
        var reservation = Reservation.builder().reservationDate(today.minusDays(1)).reservationTime(LocalTime.NOON).status(Reservation.ReservationStatus.NO_SHOW).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).refundAmount(2000).paidAt(LocalDateTime.now()).build();
        assertThat(TestSettlementPolicy.entitlement(payment, today.atTime(12, 0))).isEqualTo(8000);
        reservation.setReservationDate(today);
        assertThat(TestSettlementPolicy.entitlement(payment, today.atTime(12, 0))).isZero();
        reservation.setReservationDate(today.minusDays(1));
        reservation.setCheckedInAt(LocalDateTime.now());
        assertThat(TestSettlementPolicy.entitlement(payment, today.atTime(12, 0))).isZero();
        reservation.setCheckedInAt(null); reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
        assertThat(TestSettlementPolicy.entitlement(payment, today.atTime(12, 0))).isZero();
    }
    @Test void liveUnknownDisputeAndUnresolvedRefundAreHeld() {
        var payment = Payment.builder().status(Payment.PaymentStatus.PAID).verifiedChannelId("test-channel").verifiedStoreId("test-store").verifiedChannelType("TEST").verifiedDisputed(false).build();
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
        var reservation = Reservation.builder().reservationDate(LocalDate.now().minusDays(1)).reservationTime(LocalTime.NOON).status(Reservation.ReservationStatus.NO_SHOW).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).refundAmount(10000).paidAt(LocalDateTime.now()).build();
        assertThat(TestSettlementPolicy.entitlement(payment, LocalDateTime.now()) - 10000L).isEqualTo(-10000L);
    }

    @Test void readyNoShowAndLaterRefundAreDistinguishedFromUnsettledAttendance() {
        var today = LocalDateTime.of(2026, 11, 4, 12, 0);
        var reservation = Reservation.builder().reservationDate(today.toLocalDate().minusDays(1)).reservationTime(LocalTime.NOON).status(Reservation.ReservationStatus.UNCONFIRMED).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).status(Payment.PaymentStatus.PAID).paidAt(LocalDateTime.now())
                .verifiedChannelType("TEST").verifiedChannelId("test-channel").verifiedStoreId("test-store").verifiedDisputed(false).build();
        assertThat(TestSettlementPolicy.entitlement(payment, today)).isZero();
        assertThat(TestSettlementPolicy.state(payment, today, false, 0)).isEqualTo(TestSettlementPolicy.State.ATTENDANCE_PENDING);
        reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);
        assertThat(TestSettlementPolicy.state(payment, today, false, 10000)).isEqualTo(TestSettlementPolicy.State.READY);
        assertThat(TestSettlementPolicy.state(payment, today, false, 0)).isEqualTo(TestSettlementPolicy.State.SETTLED);
        payment.setRefundAmount(10000); payment.setStatus(Payment.PaymentStatus.REFUNDED);
        assertThat(TestSettlementPolicy.state(payment, today, false, -10000)).isEqualTo(TestSettlementPolicy.State.ADJUSTMENT_REQUIRED);
        assertThat(TestSettlementPolicy.state(payment, today, false, 0)).isEqualTo(TestSettlementPolicy.State.REFUNDED);
    }

    @Test void missingVerifiedStoreAndUnresolvedWorkBlockPaymentEvenWithAPositiveBalance() {
        var payment = Payment.builder().amount(10000).status(Payment.PaymentStatus.PAID).verifiedChannelType("TEST")
                .verifiedChannelId("test-channel").verifiedDisputed(false).build();
        assertThat(TestSettlementPolicy.held(payment, false)).isTrue();
        assertThat(TestSettlementPolicy.state(payment, LocalDateTime.now(), false, 10000)).isEqualTo(TestSettlementPolicy.State.CHANNEL_UNVERIFIED);
        payment.setVerifiedStoreId("test-store");
        assertThat(TestSettlementPolicy.held(payment, true)).isTrue();
        assertThat(TestSettlementPolicy.state(payment, LocalDateTime.now(), true, 10000)).isEqualTo(TestSettlementPolicy.State.REVIEW_REQUIRED);
    }

    @Test void anEarlyLegacyNoShowWaitsForItsOvernightEndBeforeSettlement() {
        LocalDateTime now = LocalDateTime.of(2026, 11, 5, 5, 0);
        var reservation = Reservation.builder().reservationDate(now.toLocalDate().minusDays(1)).reservationTime(LocalTime.MIDNIGHT)
                .store(Store.builder().bookingType(Store.BookingType.DAY).openTime(LocalTime.of(22, 0)).closeTime(LocalTime.of(6, 0)).build())
                .status(Reservation.ReservationStatus.NO_SHOW).build();
        var payment = Payment.builder().reservation(reservation).amount(10000).paidAt(now.minusDays(1)).status(Payment.PaymentStatus.PAID)
                .verifiedChannelType("TEST").verifiedChannelId("test-channel").verifiedStoreId("test-store").verifiedDisputed(false).build();
        assertThat(TestSettlementPolicy.entitlement(payment, now)).isZero();
        assertThat(TestSettlementPolicy.state(payment, now, false, 0)).isEqualTo(TestSettlementPolicy.State.CUTOFF_PENDING);
        assertThat(TestSettlementPolicy.entitlement(payment, now.plusHours(2))).isEqualTo(10000);
        assertThat(TestSettlementPolicy.state(payment, now.plusHours(2), false, 10000)).isEqualTo(TestSettlementPolicy.State.READY);
        reservation.setStore(null); reservation.setReservationTime(null);
        assertThat(TestSettlementPolicy.entitlement(payment, now)).isZero();
        assertThat(TestSettlementPolicy.state(payment, now, false, 0)).isEqualTo(TestSettlementPolicy.State.SCHEDULE_UNVERIFIED);
    }
}
