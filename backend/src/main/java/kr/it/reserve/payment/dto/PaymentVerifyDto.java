package kr.it.reserve.payment.dto;

import lombok.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 결제 검증 요청 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentVerifyDto {
    
    @Size(max = 255, message = "입력한 정보가 너무 길어요.") private String impUid;          // 포트원 결제 고유번호
    @NotBlank(message = "주문번호를 확인해주세요.") @Size(max = 255, message = "주문번호가 너무 길어요.") private String merchantUid;     // 가맹점 주문번호
    private Long reservationId;     // 예약 ID
}
