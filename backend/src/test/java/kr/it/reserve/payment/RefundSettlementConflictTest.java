package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.service.RefundSettlementPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RefundSettlementConflictTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {"SUCCEEDED", "FAILED", "REQUESTED"})
    void conflictingPaymentStatusRequiresReconciliation(String cancellationStatus) {
        int cancelledAmount = "SUCCEEDED".equals(cancellationStatus) ? 3_000 : 0;

        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0, 3_000, "cancel-current", payment(cancellationStatus, cancelledAmount));

        assertRequiresReconciliation(result);
    }

    @Test
    void unattributedPendingCancellationCannotOverrideConflictingPaymentStatus() {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0, 3_000, null, payment("REQUESTED", 0));

        assertRequiresReconciliation(result);
    }

    private PortoneV2PaymentResponse payment(String cancellationStatus, int cancelledAmount) {
        return objectMapper.convertValue(Map.of(
                "status", "READY",
                "amount", Map.of("total", 10_000, "cancelled", cancelledAmount),
                "cancellations", List.of(Map.of(
                        "id", "cancel-current", "status", cancellationStatus, "totalAmount", 3_000))),
                PortoneV2PaymentResponse.class);
    }

    private void assertRequiresReconciliation(RefundSettlementPolicy.Assessment result) {
        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.REVIEW_REQUIRED);
        assertThat(result.detailCode()).isEqualTo("PG_PAYMENT_STATUS_CONFLICT");
        assertThat(result.confirmedAmount()).isNull();
        assertThat(result.cancellationId()).isNull();
    }
}
