package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.Payment;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 결제 응답 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentResponseDto {
    
    private Long paymentId;
    private Long reservationId;
    private String impUid;
    private String merchantUid;
    private Integer amount;
    private String payMethod;
    private String pgProvider;
    private String status;
    private String productName;
    private String buyerName;
    private String buyerEmail;
    private String buyerTel;
    private Integer refundAmount;
    private String refundReason;
    private LocalDateTime paidAt;
    private LocalDateTime refundedAt;
    private LocalDateTime createdAt;

    public static PaymentResponseDto fromEntity(Payment payment) {
        return PaymentResponseDto.builder()
                .paymentId(payment.getId())
                .reservationId(payment.getReservation().getId())
                .impUid(payment.getImpUid())
                .merchantUid(payment.getMerchantUid())
                .amount(payment.getAmount())
                .payMethod(payment.getPayMethod())
                .pgProvider(payment.getPgProvider())
                .status(payment.getStatus().name())
                .productName(payment.getProductName())
                .buyerName(payment.getBuyerName())
                .buyerEmail(payment.getBuyerEmail())
                .buyerTel(payment.getBuyerTel())
                .refundAmount(payment.getRefundAmount())
                .refundReason(payment.getRefundReason())
                .paidAt(payment.getPaidAt())
                .refundedAt(payment.getRefundedAt())
                .createdAt(payment.getCreatedAt())
                .build();
    }
}
