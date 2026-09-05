package kr.it.reserve.payment.dto;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;

import java.time.LocalDateTime;

/** PII와 PG 원문 없이 관리자 수동 대사에 필요한 식별자와 원인 코드만 제공한다. */
public record PaymentReconciliationIssueResponse(
        Long id,
        String issueType,
        String status,
        Long paymentId,
        Long reservationId,
        String merchantUid,
        String detailCode,
        int occurrenceCount,
        LocalDateTime firstSeenAt,
        LocalDateTime lastSeenAt,
        LocalDateTime resolvedAt
) {
    public static PaymentReconciliationIssueResponse from(PaymentReconciliationIssue issue) {
        return new PaymentReconciliationIssueResponse(
                issue.getId(),
                issue.getIssueType().name(),
                issue.getStatus().name(),
                issue.getPaymentId(),
                issue.getReservationId(),
                issue.getMerchantUid(),
                issue.getDetailCode(),
                issue.getOccurrenceCount(),
                issue.getFirstSeenAt(),
                issue.getLastSeenAt(),
                issue.getResolvedAt());
    }
}
