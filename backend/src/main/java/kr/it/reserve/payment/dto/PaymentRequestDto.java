package kr.it.reserve.payment.dto;

import lombok.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * 결제 요청 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentRequestDto {
    
    @NotNull(message = "예약번호를 확인해주세요.") @Positive(message = "예약번호를 확인해주세요.")
    private Long reservationId;     // 예약 ID
    private Integer amount;
    @Size(max = 255, message = "입력한 정보가 너무 길어요.") private String productName;     // 상품명
    @Size(max = 255, message = "입력한 정보가 너무 길어요.") private String buyerName;       // 구매자 이름
    @Size(max = 255, message = "입력한 정보가 너무 길어요.") private String buyerEmail;      // 구매자 이메일
    @Size(max = 255, message = "입력한 정보가 너무 길어요.") private String buyerTel;        // 구매자 전화번호
    @Size(max = 50, message = "결제 수단을 확인해주세요.") private String pgProvider;      // PG사 (kakaopay, naverpay 등)
}
