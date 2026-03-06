package com.reserve.payment.dto;

import lombok.*;

/**
 * 환불 요청 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentRefundDto {
    
    private Long paymentId;         // 결제 ID
    private Long reservationId;     // 예약 ID
    private Integer refundAmount;   // 환불 금액 (부분 환불 시)
    private String refundReason;    // 환불 사유
}
