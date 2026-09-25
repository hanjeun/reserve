package kr.it.reserve.advertisement.entity;

/**
 * 광고 상태
 * PENDING_PAYMENT - 신청됨, 결제 대기 중
 * PAYMENT_FAILED  - 결제 실패/취소
 * ACTIVE          - 결제 완료, 현재 노출 중 (startDate~endDate 기간 내)
 * EXPIRED         - endDate 지나서 자동 만료 (스케줄러가 전환)
 * SUSPENDED       - 관리자가 부적절 광고를 사후 강제 중단 (즉시 노출 방식이라 사전 승인 대신 사후 제재)
 * CANCELLED       - 광고 취소. 금전 미결 여부는 AdPaymentAttempt가 별도로 관리
 * REFUNDED        - PG 전액 취소 상태와 금액을 확인함
 * REFUND_PENDING  - 환불 요청 중/결과 미상. 완료로 표시하지 않음
 * REVIEW_REQUIRED - 결제·노출 상태가 맞지 않아 대사가 필요함
 */
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
