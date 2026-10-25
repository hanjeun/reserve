package kr.it.reserve.advertisement.entity;

/** 광고 노출 상태와 금전 미결 여부는 별개다. 환불 완료는 PG 상태·금액 확인 뒤 확정한다. */
public enum AdStatus {
    PENDING_PAYMENT,
    PAYMENT_FAILED,
    ACTIVE,
    EXPIRED,
    SUSPENDED,
    CANCELLED,
    REFUNDED,
    REFUND_PENDING,
    REVIEW_REQUIRED
}
