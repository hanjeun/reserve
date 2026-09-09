package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.service.RefundSettlementPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RefundSettlementPolicyTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("누적 취소액과 이번 취소 ID·상태·금액이 모두 맞을 때만 성공한다")
    void confirmsExactSucceededCancellation() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                2_000,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PARTIAL_CANCELLED",
                          "amount": {"total": 10000, "cancelled": 5000},
                          "cancellations": [
                            {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                            {"id": "cancel-current", "status": "SUCCEEDED", "totalAmount": 3000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.SUCCEEDED);
        assertThat(result.confirmedAmount()).isEqualTo(3_000);
        assertThat(result.cancellationId()).isEqualTo("cancel-current");
    }

    @Test
    @DisplayName("결제 상태가 부분 취소여도 이번 취소액이 다르면 자동 성공하지 않는다")
    void rejectsOldPartialCancellationAsCurrentSuccess() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                2_000,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PARTIAL_CANCELLED",
                          "amount": {"total": 10000, "cancelled": 4000},
                          "cancellations": [
                            {"id": "cancel-old", "status": "SUCCEEDED", "totalAmount": 2000},
                            {"id": "cancel-current", "status": "SUCCEEDED", "totalAmount": 2000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.REVIEW_REQUIRED);
        assertThat(result.detailCode()).isEqualTo("PG_CANCELLATION_AMOUNT_MISMATCH");
    }

    @Test
    @DisplayName("이번 취소가 REQUESTED이면 결제가 PAID여도 실패로 되돌리지 않는다")
    void keepsRequestedCancellationPending() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PAID",
                          "amount": {"total": 10000, "cancelled": 0},
                          "cancellations": [
                            {"id": "cancel-current", "status": "REQUESTED", "totalAmount": 3000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.PENDING);
    }

    @Test
    @DisplayName("이번 취소가 명시적으로 FAILED이고 누적액이 그대로일 때만 실패를 확정한다")
    void confirmsExplicitFailedCancellation() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PAID",
                          "amount": {"total": 10000, "cancelled": 0},
                          "cancellations": [
                            {"id": "cancel-current", "status": "FAILED", "totalAmount": 3000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.FAILED);
    }

    @Test
    @DisplayName("다른 취소가 진행 중이면 이번 취소가 성공이어도 자동 확정하지 않는다")
    void rejectsConcurrentUnsettledCancellation() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PARTIAL_CANCELLED",
                          "amount": {"total": 10000, "cancelled": 3000},
                          "cancellations": [
                            {"id": "cancel-current", "status": "SUCCEEDED", "totalAmount": 3000},
                            {"id": "cancel-other", "status": "REQUESTED", "totalAmount": 1000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.REVIEW_REQUIRED);
        assertThat(result.detailCode()).isEqualTo("PG_UNRELATED_CANCELLATION_UNSETTLED");
    }

    @Test
    @DisplayName("응답을 잃어 취소 ID가 없어도 누적액이 정확하고 미결 취소가 없으면 성공을 복구한다")
    void recoversExactCumulativeRefundWithoutCancellationId() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                null,
                payment("""
                        {
                          "status": "PARTIAL_CANCELLED",
                          "amount": {"total": 10000, "cancelled": 3000},
                          "cancellations": [
                            {"id": "cancel-current", "status": "SUCCEEDED", "totalAmount": 3000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.SUCCEEDED);
        assertThat(result.confirmedAmount()).isEqualTo(3_000);
        assertThat(result.cancellationId()).isNull();
    }

    @Test
    @DisplayName("취소 ID가 없고 PG도 PAID인 상태만으로는 실패를 추측하지 않는다")
    void doesNotGuessFailureWithoutCancellationId() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                null,
                payment("""
                        {
                          "status": "PAID",
                          "amount": {"total": 10000, "cancelled": 0},
                          "cancellations": []
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.REVIEW_REQUIRED);
        assertThat(result.detailCode()).isEqualTo("PG_REFUND_OUTCOME_UNATTRIBUTED");
    }

    @Test
    @DisplayName("PG 누적 취소액이 없으면 성공·실패 어느 쪽도 자동 확정하지 않는다")
    void requiresCumulativeCancelledAmount() throws Exception {
        RefundSettlementPolicy.Assessment result = RefundSettlementPolicy.assess(
                0,
                3_000,
                "cancel-current",
                payment("""
                        {
                          "status": "PARTIAL_CANCELLED",
                          "amount": {"total": 10000},
                          "cancellations": [
                            {"id": "cancel-current", "status": "SUCCEEDED", "totalAmount": 3000}
                          ]
                        }
                        """));

        assertThat(result.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.REVIEW_REQUIRED);
        assertThat(result.detailCode()).isEqualTo("PG_CANCELLED_AMOUNT_MISSING");
    }

    private PortoneV2PaymentResponse payment(String json) throws Exception {
        return objectMapper.readValue(json, PortoneV2PaymentResponse.class);
    }
}
