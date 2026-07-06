package com.reserve.advertisement.entity;

/**
 * 광고 상태
 * PENDING_PAYMENT - 신청됨, 결제 대기 중
 * PAYMENT_FAILED  - 결제 실패/취소
 * ACTIVE          - 결제 완료, 현재 노출 중 (startDate~endDate 기간 내)
 * EXPIRED         - endDate 지나서 자동 만료 (스케줄러가 전환)
 * SUSPENDED       - 관리자가 부적절 광고를 사후 강제 중단 (즉시 노출 방식이라 사전 승인 대신 사후 제재)
 */
public enum AdStatus {
    PENDING_PAYMENT,
    PAYMENT_FAILED,
    ACTIVE,
    EXPIRED,
    SUSPENDED
}
