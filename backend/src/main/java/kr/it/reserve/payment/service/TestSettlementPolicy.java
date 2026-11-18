package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationNoShowPolicy;
import java.time.LocalDateTime;

public final class TestSettlementPolicy {
    private TestSettlementPolicy() { }
    public enum State { READY, SETTLED, ADJUSTMENT_REQUIRED, REFUNDED, ATTENDANCE_PENDING,
        VISITED, CUTOFF_PENDING, SCHEDULE_UNVERIFIED, NOT_ELIGIBLE, REVIEW_REQUIRED, CHANNEL_UNVERIFIED, DISPUTED, PAYMENT_PENDING }
    public static long entitlement(Payment payment, LocalDateTime now) {
        Reservation reservation = payment.getReservation();
        if (reservation.getStatus() != Reservation.ReservationStatus.NO_SHOW || reservation.getCheckedInAt() != null
                || !reservation.getReservationDate().isBefore(now.toLocalDate())) return 0;
        LocalDateTime available = ReservationNoShowPolicy.availableAt(reservation);
        if (available == null || !available.isBefore(now)) return 0;
        if (payment.getPaidAt() == null || payment.getAmount() == null || payment.getAmount() < 0
                || payment.refundedSoFar() < 0 || payment.refundedSoFar() > payment.getAmount())
            throw new IllegalArgumentException("Invalid settlement payment balance");
        return (long) payment.getAmount() - payment.refundedSoFar();
    }

    static long confirmedNoShowAmount(Payment payment) {
        return !unverified(payment) && payment.getPaidAt() != null && payment.getAmount() != null
                && payment.getReservation().getStatus() == Reservation.ReservationStatus.NO_SHOW
                && payment.getReservation().getCheckedInAt() == null ? payment.getAmount() : 0;
    }
    public static boolean held(Payment payment, boolean unresolved) {
        return unresolved || unverified(payment) || !Boolean.FALSE.equals(payment.getVerifiedDisputed())
                || payment.getStatus() != Payment.PaymentStatus.PAID && payment.getStatus() != Payment.PaymentStatus.PARTIAL_REFUNDED;
    }

    public static State state(Payment payment, LocalDateTime now, boolean unresolved, long balance) {
        if (balance < 0) return State.ADJUSTMENT_REQUIRED;
        if (unresolved) return State.REVIEW_REQUIRED;
        if (unverified(payment)) return State.CHANNEL_UNVERIFIED;
        if (!Boolean.FALSE.equals(payment.getVerifiedDisputed())) return State.DISPUTED;
        if (payment.getAmount() > 0 && payment.refundedSoFar() == payment.getAmount()) return State.REFUNDED;
        if (held(payment, false)) return State.PAYMENT_PENDING;
        Reservation reservation = payment.getReservation();
        if (reservation.getCheckedInAt() != null || reservation.getStatus() == Reservation.ReservationStatus.COMPLETED) return State.VISITED;
        if (reservation.getStatus() != Reservation.ReservationStatus.NO_SHOW)
            return reservation.getStatus() == Reservation.ReservationStatus.CONFIRMED || reservation.getStatus() == Reservation.ReservationStatus.UNCONFIRMED
                    ? State.ATTENDANCE_PENDING : State.NOT_ELIGIBLE;
        if (!reservation.getReservationDate().isBefore(now.toLocalDate())) return State.CUTOFF_PENDING;
        LocalDateTime available = ReservationNoShowPolicy.availableAt(reservation);
        if (available == null) return State.SCHEDULE_UNVERIFIED;
        if (!available.isBefore(now)) return State.CUTOFF_PENDING;
        return balance > 0 ? State.READY : State.SETTLED;
    }

    private static boolean unverified(Payment payment) {
        return !"TEST".equals(payment.getVerifiedChannelType())
                || payment.getVerifiedChannelId() == null || payment.getVerifiedChannelId().isBlank()
                || payment.getVerifiedStoreId() == null || payment.getVerifiedStoreId().isBlank();
    }
}
