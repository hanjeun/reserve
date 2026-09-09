package kr.it.reserve.advertisement.dto;

import kr.it.reserve.advertisement.entity.AdPaymentAttempt;
import java.time.LocalDateTime;

/** 운영 대사용 최소 원장. 구매자 PII·멱등 키·lease 토큰·외부 본문은 응답하지 않는다. */
public record AdPaymentAttemptResponse(Long id, Long adId, Long storeId, String merchantUid,
        Integer amount, String state, String pgStatus, String issueCode, Long cancelledAmount,
        boolean legacy, boolean cancelRequested, LocalDateTime refundDispatchedAt,
        LocalDateTime lastCheckedAt, LocalDateTime createdAt) {
    public static AdPaymentAttemptResponse from(AdPaymentAttempt value) {
        return new AdPaymentAttemptResponse(value.getId(), value.getAdId(), value.getStoreId(),
                value.getMerchantUid(), value.getAmount(), value.getState().name(), value.getPgStatus(),
                value.getIssueCode(), value.getCancelledAmount(), value.isLegacy(), value.isCancelRequested(),
                value.getRefundDispatchedAt(), value.getLastCheckedAt(), value.getCreatedAt());
    }
}
