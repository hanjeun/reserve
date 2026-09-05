package kr.it.reserve.payment.scheduler;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Set;

/** DB 큐가 로그 없이 방치되지 않도록 운영 알림용 안정 문구를 주기적으로 남긴다. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentOperationsMonitorScheduler {

    private static final int STALE_READY_DAYS = 7;

    private final PaymentReconciliationIssueRepository issueRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentWebhookInboxRepository inboxRepository;

    @Scheduled(fixedDelay = 15 * 60 * 1000)
    public void reportUnresolvedPaymentOperations() {
        long openIssues = issueRepository.countByStatus(
                PaymentReconciliationIssue.IssueStatus.OPEN);
        long failedWebhooks = inboxRepository.countByStatusIn(
                Set.of(PaymentWebhookInbox.InboxStatus.FAILED));
        long staleReadyPayments = paymentRepository.countByStatusAndCreatedAtBefore(
                kr.it.reserve.payment.entity.Payment.PaymentStatus.READY,
                LocalDateTime.now().minusDays(STALE_READY_DAYS));

        if (openIssues > 0 || failedWebhooks > 0 || staleReadyPayments > 0) {
            log.error("Payment operations queue requires attention: openIssues={}, failedWebhooks={}, staleReadyPayments={}",
                    openIssues, failedWebhooks, staleReadyPayments);
        }
    }
}
