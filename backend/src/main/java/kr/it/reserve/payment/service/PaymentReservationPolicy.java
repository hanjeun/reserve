package kr.it.reserve.payment.service;

import kr.it.reserve.reservation.entity.Reservation;

final class PaymentReservationPolicy {
    private PaymentReservationPolicy() {}
    static boolean closedFor(Reservation reservation) {
        return reservation.getStatus() != Reservation.ReservationStatus.PENDING
                && reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED;
    }
}
