package kr.it.reserve.payment.dto;

import lombok.*;

/**
 * 결제 준비 응답 DTO (프론트엔드로 전달)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentPrepareDto {
    
    private String merchantUid;     // 가맹점 주문번호
    private Integer amount;         // 결제 금액
    private String productName;     // 상품명
    private String buyerName;       // 구매자 이름
    private String buyerEmail;      // 구매자 이메일
    private String buyerTel;        // 구매자 전화번호
    private String impCode;         // 가맹점 식별코드
    private String pgProvider;      // PG사
    private Long reservationId;     // 예약 ID
}
