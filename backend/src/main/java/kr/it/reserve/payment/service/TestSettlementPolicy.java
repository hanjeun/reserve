package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;
import java.time.LocalDate;

public final class TestSettlementPolicy {
    private TestSettlementPolicy() { }
    public static long entitlement(Payment payment, LocalDate today) {
        Reservation reservation = payment.getReservation();
        if (reservation.getStatus() != Reservation.ReservationStatus.NO_SHOW || reservation.getCheckedInAt() != null
                || !reservation.getReservationDate().isBefore(today)) return 0;
        if (payment.getPaidAt() == null || payment.getAmount() == null || payment.getAmount() < 0
                || payment.refundedSoFar() < 0 || payment.refundedSoFar() > payment.getAmount())
            throw new IllegalArgumentException("Invalid settlement payment balance");
        return (long) payment.getAmount() - payment.refundedSoFar();
    }
    public static boolean held(Payment payment, boolean unresolved) {
        return unresolved || payment.getVerifiedChannelId() == null || !"TEST".equals(payment.getVerifiedChannelType()) || !Boolean.FALSE.equals(payment.getVerifiedDisputed())
                || payment.getStatus() != Payment.PaymentStatus.PAID && payment.getStatus() != Payment.PaymentStatus.PARTIAL_REFUNDED;
    }
}
