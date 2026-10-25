package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.RefundAttempt;

import java.time.LocalDateTime;

/** 원장은 결제 ID로만 연결해 잠금 순환과 불필요한 개인정보 반환을 피한다. */
public record RefundAttemptResponse(
        Long id,
        Long paymentId,
        String merchantUid,
        Integer requestedAmount,
        Integer cancelledAmount,
        String status,
        String cancellationId,
        String reason,
        String failureReason,
        int resolveAttempts,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static RefundAttemptResponse from(RefundAttempt attempt) {
        return new RefundAttemptResponse(
                attempt.getId(),
                attempt.getPaymentId(),
                attempt.getMerchantUid(),
                attempt.getRequestedAmount(),
                attempt.getCancelledAmount(),
                attempt.getStatus() != null ? attempt.getStatus().name() : null,
                attempt.getCancellationId(),
                attempt.getReason(),
                attempt.getFailureReason(),
                attempt.getResolveAttempts(),
                attempt.getCreatedAt(),
                attempt.getUpdatedAt()
        );
    }
}
