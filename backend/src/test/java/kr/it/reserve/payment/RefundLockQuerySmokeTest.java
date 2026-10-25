package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/** H2에서 환불 쿼리의 변환·실행만 확인한다. InnoDB 동시성 보증은 실제 MySQL에서 별도로 검사해야 한다. */
@SpringBootTest
class RefundLockQuerySmokeTest {

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private RefundAttemptRepository refundAttemptRepository;

    @Autowired
    private PaymentWebhookInboxRepository paymentWebhookInboxRepository;

    @Autowired
    private PaymentReconciliationIssueRepository paymentReconciliationIssueRepository;

    @Test
    @Transactional
    @DisplayName("행 잠금 조회가 SQL 로 실행된다 (FOR UPDATE 구문이 살아 있는지)")
    void lockingFindersExecute() {
        assertThatCode(() -> paymentRepository.findByIdForUpdate(-1L)).doesNotThrowAnyException();
        assertThatCode(() -> paymentRepository.findPaidByReservationIdForUpdate(-1L)).doesNotThrowAnyException();
        assertThatCode(() -> paymentRepository.findByMerchantUidForUpdate("missing"))
                .doesNotThrowAnyException();
        assertThatCode(() -> paymentRepository.findAllByReservationIdForUpdate(-1L))
                .doesNotThrowAnyException();

        // 없는 ID 이므로 결과는 비어 있어야 한다 — 쿼리가 조건을 무시하고 아무 행이나 집지 않는지도 함께 본다.
        assertThat(paymentRepository.findByIdForUpdate(-1L)).isEmpty();
        assertThat(paymentRepository.findPaidByReservationIdForUpdate(-1L)).isEmpty();
        assertThat(paymentRepository.findByMerchantUidForUpdate("missing")).isEmpty();
        assertThat(paymentRepository.findAllByReservationIdForUpdate(-1L)).isEmpty();
    }

    @Test
    @DisplayName("미결 원장 조회(생성자 표현식)가 SQL 로 실행된다")
    void unresolvedProjectionExecutes() {
        assertThatCode(() -> refundAttemptRepository
                .findUnresolvedBefore(RefundAttempt.UNRESOLVED, LocalDateTime.now()))
                .doesNotThrowAnyException();

        assertThat(refundAttemptRepository.countByStatusIn(RefundAttempt.UNRESOLVED)).isZero();
    }

    @Test
    @Transactional
    @DisplayName("웹훅 inbox의 잠금·재시도 쿼리가 SQL로 실행된다")
    void webhookInboxQueriesExecute() {
        assertThatCode(() -> paymentWebhookInboxRepository.findByWebhookIdForUpdate("missing"))
                .doesNotThrowAnyException();
        assertThatCode(() -> paymentWebhookInboxRepository.findRetryableWebhookIds(
                List.of(PaymentWebhookInbox.InboxStatus.RECEIVED, PaymentWebhookInbox.InboxStatus.FAILED),
                PaymentWebhookInbox.InboxStatus.PROCESSING,
                LocalDateTime.now(),
                LocalDateTime.now().minusMinutes(5),
                PageRequest.of(0, 50)))
                .doesNotThrowAnyException();
    }

    @Test
    @Transactional
    @DisplayName("결제 수동 대사 큐의 잠금·페이지 쿼리가 SQL로 실행된다")
    void reconciliationIssueQueriesExecute() {
        assertThatCode(() -> paymentReconciliationIssueRepository.findByIssueKeyForUpdate("missing"))
                .doesNotThrowAnyException();
        assertThatCode(() -> paymentReconciliationIssueRepository.findByStatusOrderByLastSeenAtDesc(
                PaymentReconciliationIssue.IssueStatus.OPEN,
                PageRequest.of(0, 50)))
                .doesNotThrowAnyException();
        assertThat(paymentReconciliationIssueRepository
                .countByStatus(PaymentReconciliationIssue.IssueStatus.OPEN)).isZero();
    }

    @Test
    @Transactional
    @DisplayName("순결제액 집계와 결제·예약금 불변식 쿼리가 SQL로 실행된다")
    void depositStatisticsAndInvariantQueriesExecute() {
        LocalDateTime now = LocalDateTime.now();
        assertThatCode(() -> paymentRepository.sumNetDepositByPaidDate(
                -1L, now.minusDays(30), now.plusDays(1)))
                .doesNotThrowAnyException();
        assertThatCode(paymentRepository::countLedgerInvariantViolations)
                .doesNotThrowAnyException();
        assertThatCode(paymentRepository::countReservationDepositInvariantViolations)
                .doesNotThrowAnyException();
    }
}
