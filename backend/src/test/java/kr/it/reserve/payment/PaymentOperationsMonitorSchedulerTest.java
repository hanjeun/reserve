package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.scheduler.PaymentOperationsMonitorScheduler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

@ExtendWith(MockitoExtension.class)
class PaymentOperationsMonitorSchedulerTest {

    @Mock private PaymentReconciliationIssueRepository issueRepository;
    @Mock private PaymentWebhookInboxRepository inboxRepository;
    @Mock private PaymentRepository paymentRepository;

    @InjectMocks
    private PaymentOperationsMonitorScheduler scheduler;

    @Test
    @DisplayName("운영 알림 스케줄러는 열린 대사 건과 실패 웹훅을 모두 집계한다")
    void countsBothOperationalQueues() {
        scheduler.reportUnresolvedPaymentOperations();

        verify(issueRepository).countByStatus(PaymentReconciliationIssue.IssueStatus.OPEN);
        verify(inboxRepository).countByStatusIn(
                java.util.Set.of(PaymentWebhookInbox.InboxStatus.FAILED));
        verify(paymentRepository).countByStatusAndCreatedAtBefore(
                eq(Payment.PaymentStatus.READY),
                any(LocalDateTime.class));
    }
}
