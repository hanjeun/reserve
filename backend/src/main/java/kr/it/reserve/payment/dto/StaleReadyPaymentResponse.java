package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;

import java.time.LocalDateTime;

/** 오래된 READY 결제를 PII 없이 관리자에게 보여주는 목록 DTO. */
public record StaleReadyPaymentResponse(
        Long paymentId,
        String merchantUid,
        Integer amount,
        Long reservationId,
        String reservationStatus,
        LocalDateTime reservationDeletedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static StaleReadyPaymentResponse from(Payment payment) {
        Reservation reservation = payment.getReservation();
        return new StaleReadyPaymentResponse(
                payment.getId(),
                payment.getMerchantUid(),
                payment.getAmount(),
                reservation != null ? reservation.getId() : null,
                reservation != null && reservation.getStatus() != null
                        ? reservation.getStatus().name()
                        : null,
                reservation != null ? reservation.getDeletedAt() : null,
                payment.getCreatedAt(),
                payment.getUpdatedAt());
    }
}
