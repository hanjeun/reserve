package kr.it.reserve.payment.dto;

import lombok.*;

/**
 * 결제 요청 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentRequestDto {
    
    private Long reservationId;     // 예약 ID
    private Integer amount;         // 결제 금액
    private String productName;     // 상품명
    private String buyerName;       // 구매자 이름
    private String buyerEmail;      // 구매자 이메일
    private String buyerTel;        // 구매자 전화번호
    private String pgProvider;      // PG사 (kakaopay, naverpay 등)
}
