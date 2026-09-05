package kr.it.reserve.payment.scheduler;

import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 서명 검증 뒤 저장됐지만 끝나지 않은 웹훅을 다시 처리한다. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentWebhookInboxRetryScheduler {

    private final PaymentWebhookInboxStateService inboxStateService;
    private final PaymentWebhookInboxProcessor inboxProcessor;

    @Scheduled(fixedDelay = 60 * 1000)
    public void retryUnfinishedWebhooks() {
        for (String webhookId : inboxStateService.findRetryableWebhookIds()) {
            try {
                inboxProcessor.retry(webhookId);
            } catch (RuntimeException e) {
                log.warn("PortOne webhook inbox retry failed: webhookId={}, errorType={}",
                        webhookId, e.getClass().getSimpleName());
            }
        }
    }
}
