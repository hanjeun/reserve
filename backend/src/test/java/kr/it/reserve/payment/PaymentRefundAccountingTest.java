package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.Payment;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 환불 금액 회계 — 엔티티 단위.
 *
 * <h2>왜 이 테스트가 필요한가</h2>
 * 예전 {@code refundPayment} 는 환불액을 <b>대입</b>했다({@code this.refundAmount = refundAmount}).
 * 부분 환불이 두 번 일어나면 앞의 금액이 지워져 <b>얼마를 돌려줬는지가 장부에서 사라진다.</b>
 * 그리고 완료 판정이 "이번 회차 금액 == 결제액" 이라, 5만원을 2만+3만으로 나눠 돌려주면
 * 전액을 환불하고도 영원히 PARTIAL_REFUNDED 로 남았다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는다 — 검증 대상이 순수한 계산과 상태 전이라 DB 가 필요 없다.
 * (동시성 방어는 여기서 검증할 수 없다. 그건 행 잠금의 몫이고 실제 MySQL 이 있어야 확인된다.)
 */
class PaymentRefundAccountingTest {

    private Payment paidPayment(int amount) {
        Payment payment = Payment.builder()
                .merchantUid("test-merchant-uid")
                .amount(amount)
                .status(Payment.PaymentStatus.PAID)
                .refundAmount(0)
                .build();
        return payment;
    }

    @Test
    @DisplayName("부분 환불이 두 번이면 금액이 누적된다 — 덮어쓰지 않는다")
    void partialRefundsAccumulate() {
        Payment payment = paidPayment(50_000);

        payment.refundPayment(20_000, "1차");
        assertThat(payment.refundedSoFar()).isEqualTo(20_000);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PARTIAL_REFUNDED);

        payment.refundPayment(30_000, "2차");
        // 예전 코드라면 여기서 30,000 이 되어 앞의 20,000 이 사라졌다.
        assertThat(payment.refundedSoFar()).isEqualTo(50_000);
    }

    @Test
    @DisplayName("나눠서 전액을 돌려주면 REFUNDED 가 된다 — 회차 금액이 아니라 누적으로 판정")
    void splitRefundsReachFullyRefunded() {
        Payment payment = paidPayment(50_000);

        payment.refundPayment(20_000, "1차");
        payment.refundPayment(30_000, "2차");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
    }

    @Test
    @DisplayName("한 번에 전액이면 REFUNDED")
    void fullRefundInOneGo() {
        Payment payment = paidPayment(50_000);

        payment.refundPayment(50_000, "전액");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        assertThat(payment.remainingRefundable()).isZero();
    }

    @Test
    @DisplayName("남은 환불 가능액은 결제액에서 이미 환불된 금액을 뺀 값")
    void remainingRefundableSubtractsWhatIsAlreadyRefunded() {
        Payment payment = paidPayment(50_000);
        assertThat(payment.remainingRefundable()).isEqualTo(50_000);

        payment.refundPayment(20_000, "1차");

        assertThat(payment.remainingRefundable()).isEqualTo(30_000);
    }

    @Test
    @DisplayName("refundAmount 가 NULL 인 옛 행도 0 으로 다뤄진다")
    void nullRefundAmountIsTreatedAsZero() {
        Payment payment = Payment.builder()
                .merchantUid("legacy-row")
                .amount(10_000)
                .status(Payment.PaymentStatus.PAID)
                .refundAmount(null)
                .build();

        assertThat(payment.refundedSoFar()).isZero();
        assertThat(payment.remainingRefundable()).isEqualTo(10_000);

        payment.refundPayment(10_000, "전액");
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
    }

    @Test
    @DisplayName("접수 상태로 표시해도 금액은 아직 더하지 않는다")
    void pendingRefundDoesNotBookMoney() {
        Payment payment = paidPayment(50_000);

        payment.markRefundPending("접수됨");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        // 확정되지 않은 돈을 장부에 올리면 안 된다.
        assertThat(payment.refundedSoFar()).isZero();
    }

    @Test
    @DisplayName("접수된 환불이 실패로 판명되면 PAID 로 되돌아간다 — 재시도할 수 있어야 하므로")
    void revertPendingGoesBackToPaid() {
        Payment payment = paidPayment(50_000);
        payment.markRefundPending("접수됨");

        payment.revertRefundPending("PG 거절");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
    }

    @Test
    @DisplayName("부분 환불 이력이 있으면 되돌릴 때 PARTIAL_REFUNDED 로 간다 — PAID 로 가면 이미 나간 돈이 지워진다")
    void revertPendingKeepsPartialHistory() {
        Payment payment = paidPayment(50_000);
        payment.refundPayment(20_000, "1차");
        payment.markRefundPending("2차 접수됨");

        payment.revertRefundPending("PG 거절");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PARTIAL_REFUNDED);
        assertThat(payment.refundedSoFar()).isEqualTo(20_000);
    }

    @Test
    @DisplayName("REFUND_PENDING 이 아닌 결제는 되돌리기가 아무것도 하지 않는다 — 멱등")
    void revertIsNoOpWhenNotPending() {
        Payment payment = paidPayment(50_000);

        payment.revertRefundPending("무관한 호출");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
    }
}
