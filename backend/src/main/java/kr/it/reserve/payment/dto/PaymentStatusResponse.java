package kr.it.reserve.payment.dto;

import java.time.LocalDate;
import java.time.LocalTime;

/** 본인 결제와 연결된 예약을 읽으며 PG 검증·환불은 실행하지 않는다. */
public record PaymentStatusResponse(String type, String merchantUid, String status, Integer amount, String payMethod,
                                    String payProvider, Integer refundedAmount, ReservationSummary reservation) {
    public record ReservationSummary(String storeName, String reservationCode, LocalDate reservationDate,
                                     LocalTime reservationTime, Integer guestCount, String memberName) {}
}
