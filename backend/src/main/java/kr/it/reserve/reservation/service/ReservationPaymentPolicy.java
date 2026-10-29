package kr.it.reserve.reservation.service;

import kr.it.reserve.reservation.entity.Reservation;
import java.time.LocalDateTime;

/** 결제 표시·준비·만료가 같은 서버 기한을 사용한다. */
public final class ReservationPaymentPolicy {
    private ReservationPaymentPolicy() {}

    public static boolean requiresAdvancePayment(Reservation reservation) {
        return reservation.getDepositAmount() != null && reservation.getDepositAmount() > 0
                && !Boolean.TRUE.equals(reservation.getDepositPaid()) && reservation.getStore() != null
                && !Boolean.TRUE.equals(reservation.getStore().getAllowLatePayment());
    }

    public static LocalDateTime deadline(Reservation reservation) {
        if (reservation == null || reservation.getStatus() != Reservation.ReservationStatus.PENDING
                || !requiresAdvancePayment(reservation) || reservation.getCreatedAt() == null) return null;
        Integer configured = reservation.getStore().getPaymentTimeoutMinutes();
        int minutes = configured == null ? 30 : configured;
        return minutes > 0 ? reservation.getCreatedAt().plusMinutes(minutes) : null;
    }

    public static boolean expiredAt(Reservation reservation, LocalDateTime now) {
        LocalDateTime deadline = deadline(reservation);
        return deadline != null && !now.isBefore(deadline);
    }
}
