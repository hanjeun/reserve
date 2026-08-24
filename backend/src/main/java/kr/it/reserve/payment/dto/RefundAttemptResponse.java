package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.RefundAttempt;

import java.time.LocalDateTime;

/**
 * 환불 원장 관리자 조회 응답 — 2026-08-23 신설.
 *
 * <p>원장 엔티티는 결제를 ID 로만 들고 있다(교착 회피 — {@code RefundAttempt#paymentId} 주석).
 * 그래서 여기서도 ID 만 내보낸다. 결과적으로 구매자 이름·이메일·전화번호가
 * 관리자 화면 JSON 에 실릴 일이 없다 — 원장 화면에 필요한 건 "어느 결제인지"뿐이다.
 */
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
