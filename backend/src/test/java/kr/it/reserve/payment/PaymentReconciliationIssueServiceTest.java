package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class PaymentReconciliationIssueServiceTest {

    @Autowired private PaymentReconciliationIssueService issueService;
    @Autowired private PaymentReconciliationIssueRepository issueRepository;

    @BeforeEach
    @AfterEach
    void clearQueue() {
        issueRepository.deleteAll();
    }

    @ParameterizedTest
    @EnumSource(PaymentReconciliationIssue.IssueType.class)
    void financialEvidenceIsSeparatedFromRetryableLookupErrors(PaymentReconciliationIssue.IssueType type) {
        issueService.recordIssue("synthetic-conflict", type, 77L, 88L, "order-77", "SYNTHETIC");
        boolean financial = java.util.Set.of(
                PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                PaymentReconciliationIssue.IssueType.PAID_STATE_CONFLICT,
                PaymentReconciliationIssue.IssueType.PAID_AMOUNT_MISMATCH,
                PaymentReconciliationIssue.IssueType.REFUND_LEDGER_MISSING,
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN).contains(type);
        assertThat(issueService.hasFinancialConflict(88L)).isEqualTo(financial);
        assertThat(issueService.hasFinancialConflict(89L)).isFalse();
        issueService.resolveForPayment(77L);
        assertThat(issueService.hasFinancialConflict(88L)).isFalse();
    }

    @Test
    @DisplayName("같은 결제 문제는 중복 행 대신 횟수와 최신 원인을 갱신하고, 성공 시 해소된다")
    void repeatedIssueIsCoalescedAndResolved() {
        issueService.recordIssue(
                "EXPIRY:77",
                PaymentReconciliationIssue.IssueType.EXPIRY_RECHECK_FAILED,
                77L,
                88L,
                "order-77",
                "IllegalStateException");
        issueService.recordIssue(
                "EXPIRY:77",
                PaymentReconciliationIssue.IssueType.EXPIRY_STATUS_UNCERTAIN,
                77L,
                88L,
                "order-77",
                "VIRTUAL_ACCOUNT_ISSUED");

        assertThat(issueRepository.count()).isOne();
        PaymentReconciliationIssue issue = issueRepository.findAll().get(0);
        assertThat(issue.getOccurrenceCount()).isEqualTo(2);
        assertThat(issue.getIssueType())
                .isEqualTo(PaymentReconciliationIssue.IssueType.EXPIRY_STATUS_UNCERTAIN);
        assertThat(issue.getDetailCode()).isEqualTo("VIRTUAL_ACCOUNT_ISSUED");
        assertThat(issue.getStatus()).isEqualTo(PaymentReconciliationIssue.IssueStatus.OPEN);

        issueService.resolveForPayment(77L);

        PaymentReconciliationIssue resolved = issueRepository.findById(issue.getId()).orElseThrow();
        assertThat(resolved.getStatus()).isEqualTo(PaymentReconciliationIssue.IssueStatus.RESOLVED);
        assertThat(resolved.getResolvedAt()).isNotNull();
    }
}
