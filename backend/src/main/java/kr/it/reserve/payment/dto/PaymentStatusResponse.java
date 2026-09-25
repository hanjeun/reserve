package kr.it.reserve.payment.dto;

/** 결제 결과 화면용 최소 응답. DB 기록 조회이며 PG 재검증이나 환불을 실행하지 않는다. */
public record PaymentStatusResponse(String type, String merchantUid, String status, Integer amount, String payMethod) {
}
