package kr.it.reserve.payment.dto;

/** 결제창 종료는 결제 취소 증거가 아니므로 서버 관측 결과만 안내에 사용해요. */
public record PaymentCheckoutReturnResponse(String merchantUid, Outcome outcome, Long storeId) {
    public enum Outcome { INCOMPLETE, STATUS, REVIEW_REQUIRED }
}
