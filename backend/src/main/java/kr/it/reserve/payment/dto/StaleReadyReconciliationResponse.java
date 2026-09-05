package kr.it.reserve.payment.dto;

/** 오래된 READY 한 건을 PG와 다시 맞춘 결과. 원문 응답이나 구매자 PII는 노출하지 않는다. */
public record StaleReadyReconciliationResponse(
        Long paymentId,
        String merchantUid,
        String localStatus,
        String pgStatus,
        Outcome outcome
) {
    public enum Outcome {
        PAID_RECOVERED,
        CLOSED_AS_NOT_PAID,
        STILL_PENDING,
        MANUAL_REVIEW_REQUIRED,
        RETRY_REQUIRED,
        ALREADY_RESOLVED
    }
}
