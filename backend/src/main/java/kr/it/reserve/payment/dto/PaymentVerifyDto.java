package kr.it.reserve.payment.dto;

import lombok.*;

/**
 * 결제 검증 요청 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentVerifyDto {
    
    private String impUid;          // 포트원 결제 고유번호
    private String merchantUid;     // 가맹점 주문번호
    private Long reservationId;     // 예약 ID
}
