package kr.it.reserve.payment.service;

import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;

import java.util.List;
import java.util.Objects;

/** 결제 상태만으로 현재 환불을 확정하지 않는다. 취소 ID·개별 상태·금액·누적 취소액이 모두 맞을 때만 원장에 반영하고 불명확하면 대사 대상으로 남긴다. */
public final class RefundSettlementPolicy {

    private static final String CANCELLATION_SUCCEEDED = "SUCCEEDED";
    private static final String PAYMENT_STATUS_CONFLICT = "PG_PAYMENT_STATUS_CONFLICT";

    private RefundSettlementPolicy() {
    }

    /** 과거 결제만 커밋된 경우에도 저장한 개별 취소 ID가 일치할 때만 원장 종결을 재평가한다. */
    public static LocalAssessment assessLocalState(Payment.PaymentStatus status, int locallyRefundedAmount,
            Integer requestedAmount, String cancellationId, PortoneV2PaymentResponse pgPayment) {
        Assessment current = assess(locallyRefundedAmount, requestedAmount, cancellationId, pgPayment);
        if ((status == Payment.PaymentStatus.REFUNDED || status == Payment.PaymentStatus.PARTIAL_REFUNDED)
                && cancellationId != null && !cancellationId.isBlank() && requestedAmount != null
                && requestedAmount > 0 && locallyRefundedAmount >= requestedAmount) {
            int prior = locallyRefundedAmount - requestedAmount;
            Assessment recorded = assess(prior, requestedAmount, cancellationId, pgPayment);
            if (recorded.outcome() == Outcome.SUCCEEDED) return new LocalAssessment(prior, recorded);
        }
        return new LocalAssessment(locallyRefundedAmount, current);
    }

    public record LocalAssessment(int priorRefundedAmount, Assessment assessment) { }

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
        return assessValidatedPayment(
                locallyRefundedAmount, requestedAmount, cancellationId, pgPayment, pgCancelledValue);
    }

    private static Assessment assessValidatedPayment(
            int locallyRefundedAmount,
            int requestedAmount,
            String cancellationId,
            PortoneV2PaymentResponse pgPayment,
            long pgCancelledValue) {
        Assessment invalidAmounts = validateAmounts(locallyRefundedAmount, requestedAmount, pgCancelledValue);
        if (invalidAmounts != null) {
            return invalidAmounts;
        }
        long expectedCancelledAmount = (long) locallyRefundedAmount + requestedAmount;
        int pgCancelledAmount = (int) pgCancelledValue;

        List<PortoneV2CancelResponse.Cancellation> cancellations = pgPayment.getCancellations();
        if (cancellations == null) {
            return review("PG_CANCELLATIONS_MISSING");
        }
        if (cancellations.stream().anyMatch(Objects::isNull)) {
            return review("PG_CANCELLATION_ENTRY_INVALID");
        }
        long succeededTotal = 0;
        for (PortoneV2CancelResponse.Cancellation cancellation : cancellations) {
            if (!CANCELLATION_SUCCEEDED.equals(cancellation.getStatus())) {
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
            case CANCELLATION_SUCCEEDED -> assessSucceededCancellation(
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

    private static Assessment validateAmounts(
            int locallyRefundedAmount,
            int requestedAmount,
            long pgCancelledValue) {
        if (pgCancelledValue < 0 || pgCancelledValue > Integer.MAX_VALUE) {
            return review("PG_CANCELLED_AMOUNT_INVALID");
        }

        long expectedCancelledAmount = (long) locallyRefundedAmount + requestedAmount;
        if (expectedCancelledAmount > Integer.MAX_VALUE) {
            return review("EXPECTED_CANCELLED_AMOUNT_INVALID");
        }

        long pgCancelledAmount = pgCancelledValue;
        if (pgCancelledAmount < locallyRefundedAmount) {
            return review("PG_CANCELLED_BELOW_LOCAL_LEDGER");
        }
        if (pgCancelledAmount > expectedCancelledAmount) {
            return review("PG_CANCELLED_EXCEEDS_EXPECTED");
        }

        return null;
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
            return review(PAYMENT_STATUS_CONFLICT);
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
            return review(PAYMENT_STATUS_CONFLICT);
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
            return review(PAYMENT_STATUS_CONFLICT);
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
                return review(PAYMENT_STATUS_CONFLICT);
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
        return !CANCELLATION_SUCCEEDED.equals(cancellation.getStatus())
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
