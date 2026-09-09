package kr.it.reserve.payment.service;

import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;

import java.util.List;

/**
 * PG 환불 조회 결과를 로컬 원장에 반영해도 되는지 판정하는 단일 정책 관문.
 *
 * <p>결제의 {@code CANCELLED}/{@code PARTIAL_CANCELLED}/{@code PAID} 상태만으로는
 * 이번 환불 시도의 성공·실패를 알 수 없다. 과거 부분 환불 때문에 이미 같은 상태일 수 있고,
 * 별도의 취소가 아직 {@code REQUESTED} 일 수도 있기 때문이다. 따라서 누적 취소액,
 * 이번 취소 ID, 개별 취소 상태와 금액이 모두 맞을 때만 자동 확정한다.
 * 애매한 경우에는 결제와 원장을 그대로 두고 운영 대사 대상으로 남긴다.
 */
public final class RefundSettlementPolicy {

    private RefundSettlementPolicy() {
    }

    public static Assessment assess(
            int locallyRefundedAmount,
            Integer requestedAmount,
            String cancellationId,
            PortoneV2PaymentResponse pgPayment) {
        if (locallyRefundedAmount < 0) {
            return review("LOCAL_REFUNDED_AMOUNT_INVALID");
        }
        if (requestedAmount == null || requestedAmount <= 0) {
            return review("LOCAL_REQUESTED_AMOUNT_INVALID");
        }
        if (pgPayment == null) {
            return review("PG_PAYMENT_RESPONSE_MISSING");
        }

        Long pgCancelledValue = pgPayment.getCancelledAmount();
        if (pgCancelledValue == null) {
            return review("PG_CANCELLED_AMOUNT_MISSING");
        }
        if (pgCancelledValue < 0 || pgCancelledValue > Integer.MAX_VALUE) {
            return review("PG_CANCELLED_AMOUNT_INVALID");
        }

        long expectedCancelledAmount = (long) locallyRefundedAmount + requestedAmount;
        if (expectedCancelledAmount > Integer.MAX_VALUE) {
            return review("EXPECTED_CANCELLED_AMOUNT_INVALID");
        }

        int pgCancelledAmount = pgCancelledValue.intValue();
        if (pgCancelledAmount < locallyRefundedAmount) {
            return review("PG_CANCELLED_BELOW_LOCAL_LEDGER");
        }
        if (pgCancelledAmount > expectedCancelledAmount) {
            return review("PG_CANCELLED_EXCEEDS_EXPECTED");
        }

        List<PortoneV2CancelResponse.Cancellation> cancellations = pgPayment.getCancellations();
        if (cancellations == null) {
            return review("PG_CANCELLATIONS_MISSING");
        }
        if (cancellations.stream().anyMatch(value -> value == null)) {
            return review("PG_CANCELLATION_ENTRY_INVALID");
        }
        long succeededTotal = 0;
        for (PortoneV2CancelResponse.Cancellation cancellation : cancellations) {
            if (!"SUCCEEDED".equals(cancellation.getStatus())) {
                continue;
            }
            if (cancellation.getTotalAmount() == null || cancellation.getTotalAmount() < 0) {
                return review("PG_SUCCEEDED_CANCELLATION_AMOUNT_MISSING");
            }
            succeededTotal += cancellation.getTotalAmount();
        }
        if (succeededTotal != pgCancelledAmount) {
            return review("PG_CANCELLATION_AGGREGATE_MISMATCH");
        }

        String expectedCancellationId = normalize(cancellationId);
        if (expectedCancellationId == null) {
            return assessWithoutCancellationId(
                    locallyRefundedAmount,
                    requestedAmount,
                    expectedCancelledAmount,
                    pgCancelledAmount,
                    pgPayment.getStatus(),
                    cancellations);
        }

        List<PortoneV2CancelResponse.Cancellation> matching = cancellations.stream()
                .filter(value -> expectedCancellationId.equals(normalize(value.getId())))
                .toList();
        if (matching.isEmpty()) {
            return review("PG_CANCELLATION_ID_NOT_FOUND");
        }
        if (matching.size() > 1) {
            return review("PG_CANCELLATION_ID_DUPLICATED");
        }

        PortoneV2CancelResponse.Cancellation target = matching.get(0);
        boolean unrelatedUnsettled = cancellations.stream()
                .filter(value -> value != target)
                .anyMatch(RefundSettlementPolicy::isUnsettled);
        if (unrelatedUnsettled) {
            return review("PG_UNRELATED_CANCELLATION_UNSETTLED");
        }

        return switch (target.getStatus() == null ? "" : target.getStatus()) {
            case "SUCCEEDED" -> assessSucceededCancellation(
                    requestedAmount,
                    expectedCancelledAmount,
                    pgCancelledAmount,
                    pgPayment.getStatus(),
                    target);
            case "FAILED" -> assessFailedCancellation(
                    locallyRefundedAmount,
                    pgCancelledAmount,
                    pgPayment.getStatus(),
                    expectedCancellationId);
            default -> assessUnsettledCancellation(
                    locallyRefundedAmount,
                    pgCancelledAmount,
                    pgPayment.getStatus(),
                    expectedCancellationId);
        };
    }

    private static Assessment assessSucceededCancellation(
            int requestedAmount,
            long expectedCancelledAmount,
            int pgCancelledAmount,
            String pgStatus,
            PortoneV2CancelResponse.Cancellation target) {
        if (target.getTotalAmount() == null || target.getTotalAmount() != requestedAmount) {
            return review("PG_CANCELLATION_AMOUNT_MISMATCH");
        }
        if (pgCancelledAmount != expectedCancelledAmount) {
            return review("PG_CUMULATIVE_CANCELLED_MISMATCH");
        }
        if (!isCancelledPaymentStatus(pgStatus)) {
            return review("PG_PAYMENT_STATUS_CONFLICT");
        }
        return new Assessment(
                Outcome.SUCCEEDED,
                requestedAmount,
                normalize(target.getId()),
                "PG_REFUND_EXACTLY_CONFIRMED");
    }

    private static Assessment assessFailedCancellation(
            int locallyRefundedAmount,
            int pgCancelledAmount,
            String pgStatus,
            String cancellationId) {
        if (pgCancelledAmount != locallyRefundedAmount) {
            return review("PG_CANCELLED_CHANGED_AFTER_FAILURE");
        }
        if (!isBasePaymentStatus(pgStatus, locallyRefundedAmount)) {
            return review("PG_PAYMENT_STATUS_CONFLICT");
        }
        return new Assessment(
                Outcome.FAILED,
                null,
                cancellationId,
                "PG_CANCELLATION_EXPLICITLY_FAILED");
    }

    private static Assessment assessUnsettledCancellation(
            int locallyRefundedAmount,
            int pgCancelledAmount,
            String pgStatus,
            String cancellationId) {
        if (pgCancelledAmount != locallyRefundedAmount) {
            return review("PG_CANCELLED_CHANGED_WHILE_PENDING");
        }
        if (!isBasePaymentStatus(pgStatus, locallyRefundedAmount)) {
            return review("PG_PAYMENT_STATUS_CONFLICT");
        }
        return new Assessment(
                Outcome.PENDING,
                null,
                cancellationId,
                "PG_CANCELLATION_UNSETTLED");
    }

    private static Assessment assessWithoutCancellationId(
            int locallyRefundedAmount,
            int requestedAmount,
            long expectedCancelledAmount,
            int pgCancelledAmount,
            String pgStatus,
            List<PortoneV2CancelResponse.Cancellation> cancellations) {
        boolean hasUnsettled = cancellations.stream().anyMatch(RefundSettlementPolicy::isUnsettled);
        if (hasUnsettled) {
            if (pgCancelledAmount != locallyRefundedAmount) {
                return review("PG_CANCELLED_CHANGED_WHILE_PENDING");
            }
            if (!isBasePaymentStatus(pgStatus, locallyRefundedAmount)) {
                return review("PG_PAYMENT_STATUS_CONFLICT");
            }
            return new Assessment(
                    Outcome.PENDING,
                    null,
                    null,
                    "PG_CANCELLATION_UNSETTLED_WITHOUT_ID");
        }

        if (pgCancelledAmount == expectedCancelledAmount && isCancelledPaymentStatus(pgStatus)) {
            return new Assessment(
                    Outcome.SUCCEEDED,
                    requestedAmount,
                    null,
                    "PG_CUMULATIVE_REFUND_EXACTLY_CONFIRMED");
        }

        return review(pgCancelledAmount == locallyRefundedAmount
                ? "PG_REFUND_OUTCOME_UNATTRIBUTED"
                : "PG_CUMULATIVE_CANCELLED_MISMATCH");
    }

    private static boolean isUnsettled(PortoneV2CancelResponse.Cancellation cancellation) {
        return !"SUCCEEDED".equals(cancellation.getStatus())
                && !"FAILED".equals(cancellation.getStatus());
    }

    private static boolean isCancelledPaymentStatus(String status) {
        return "CANCELLED".equals(status) || "PARTIAL_CANCELLED".equals(status);
    }

    private static boolean isBasePaymentStatus(String status, int locallyRefundedAmount) {
        return locallyRefundedAmount == 0
                ? "PAID".equals(status)
                : "PARTIAL_CANCELLED".equals(status);
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Assessment review(String detailCode) {
        return new Assessment(Outcome.REVIEW_REQUIRED, null, null, detailCode);
    }

    public enum Outcome {
        SUCCEEDED,
        FAILED,
        PENDING,
        REVIEW_REQUIRED
    }

    public record Assessment(
            Outcome outcome,
            Integer confirmedAmount,
            String cancellationId,
            String detailCode) {
    }
}
