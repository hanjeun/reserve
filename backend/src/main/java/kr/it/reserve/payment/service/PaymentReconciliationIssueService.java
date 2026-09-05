package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** 문제 기록은 결제 롤백과 무관하게 남기고, 해소는 결제 상태 변경과 함께 커밋한다. */
@Service
@RequiredArgsConstructor
public class PaymentReconciliationIssueService {

    private final PaymentReconciliationIssueRepository issueRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            String issueKey,
            PaymentReconciliationIssue.IssueType issueType,
            Long paymentId,
            Long reservationId,
            String merchantUid,
            String detailCode) {
        LocalDateTime now = LocalDateTime.now();
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
        LocalDateTime now = LocalDateTime.now();
        issueRepository.findByPaymentIdAndStatus(
                        paymentId,
                        PaymentReconciliationIssue.IssueStatus.OPEN)
                .forEach(issue -> issue.resolve(now));
    }
}
