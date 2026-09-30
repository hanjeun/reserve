package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository.DepositInvariantLedgerSummary;
import kr.it.reserve.payment.repository.PaymentRepository.DepositInvariantReservation;
import kr.it.reserve.reservation.entity.Reservation.ReservationStatus;

import java.time.LocalDateTime;
import java.util.List;

/** 관리자 읽기 전용 진단. 방향은 원인이나 PG 실제 상태를 확정하는 값이 아니다. */
public record ReservationDepositInvariantResponse(
        Long reservationId,
        Long storeId,
        ReservationStatus reservationStatus,
        Boolean depositPaid,
        LocalDateTime reservationDeletedAt,
        Direction direction,
        long confirmedNetAmount,
        long confirmedRefundAmount,
        long positiveBalancePaymentCount,
        List<LedgerStatus> ledgerStatuses
) {
    public enum Direction {
        DEPOSIT_PAID_WITHOUT_POSITIVE_LEDGER,
        POSITIVE_LEDGER_WITHOUT_DEPOSIT_PAID
    }

    public record LedgerStatus(
            Payment.PaymentStatus status,
            long paymentCount,
            long confirmedNetAmount,
            long confirmedRefundAmount,
            long positiveBalancePaymentCount
    ) {}

    public static ReservationDepositInvariantResponse from(
            DepositInvariantReservation reservation,
            List<DepositInvariantLedgerSummary> ledger) {
        List<LedgerStatus> statuses = ledger.stream().map(row -> new LedgerStatus(
                row.getPaymentStatus(), row.getPaymentCount(), row.getConfirmedNetAmount(),
                row.getConfirmedRefundAmount(), row.getPositiveBalancePaymentCount())).toList();
        return new ReservationDepositInvariantResponse(
                reservation.getReservationId(), reservation.getStoreId(), reservation.getReservationStatus(),
                reservation.getDepositPaid(), reservation.getReservationDeletedAt(),
                Boolean.TRUE.equals(reservation.getDepositPaid())
                        ? Direction.DEPOSIT_PAID_WITHOUT_POSITIVE_LEDGER
                        : Direction.POSITIVE_LEDGER_WITHOUT_DEPOSIT_PAID,
                statuses.stream().mapToLong(LedgerStatus::confirmedNetAmount).sum(),
                statuses.stream().mapToLong(LedgerStatus::confirmedRefundAmount).sum(),
                statuses.stream().mapToLong(LedgerStatus::positiveBalancePaymentCount).sum(),
                statuses);
    }
}
