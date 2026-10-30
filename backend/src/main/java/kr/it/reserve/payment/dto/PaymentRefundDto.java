package kr.it.reserve.payment.dto;

import lombok.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

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
    @NotNull(message = "예약번호를 확인해주세요.") @Positive(message = "예약번호를 확인해주세요.") private Long reservationId;     // 예약 ID
    private Integer refundAmount;   // 환불 금액 (부분 환불 시)
    @Size(max = 500, message = "환불 사유는 500자 이내로 입력해주세요.") private String refundReason;
}
