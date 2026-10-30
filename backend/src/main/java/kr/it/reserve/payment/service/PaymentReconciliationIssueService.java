package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 문제 기록은 결제 롤백과 무관하게 남기고, 해소는 결제 상태 변경과 함께 커밋한다. */
@Service
@RequiredArgsConstructor
public class PaymentReconciliationIssueService {

    private final PaymentReconciliationIssueRepository issueRepository;

    @Transactional(readOnly = true)
    public boolean hasOpenReservationIssues(Long reservationId) {
        return issueRepository.existsOpenForReservation(reservationId);
    }

    @Transactional(readOnly = true)
    public boolean hasFinancialConflict(Long reservationId) {
        return issueRepository.existsOpenConflictForReservation(reservationId, java.util.EnumSet.of(
                PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                PaymentReconciliationIssue.IssueType.PAID_STATE_CONFLICT,
                PaymentReconciliationIssue.IssueType.PAID_AMOUNT_MISMATCH,
                PaymentReconciliationIssue.IssueType.REFUND_LEDGER_MISSING,
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIssue(
            String issueKey,
            PaymentReconciliationIssue.IssueType issueType,
            Long paymentId,
            Long reservationId,
            String merchantUid,
            String detailCode) {
        LocalDateTime now = LocalDateTime.now(Clock.systemDefaultZone());
        PaymentReconciliationIssue issue = issueRepository.findByIssueKeyForUpdate(issueKey)
                .orElse(null);
        if (issue == null) {
            issueRepository.saveAndFlush(PaymentReconciliationIssue.open(
                    issueKey,
                    issueType,
                    paymentId,
                    reservationId,
                    merchantUid,
                    detailCode,
                    now));
            return;
        }
        issue.touch(issueType, detailCode, now);
    }

    @Transactional
    public void resolveForPayment(Long paymentId) {
        if (paymentId == null) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(Clock.systemDefaultZone());
        issueRepository.findByPaymentIdAndStatus(
                        paymentId,
                        PaymentReconciliationIssue.IssueStatus.OPEN)
                .forEach(issue -> issue.resolve(now));
    }
}
