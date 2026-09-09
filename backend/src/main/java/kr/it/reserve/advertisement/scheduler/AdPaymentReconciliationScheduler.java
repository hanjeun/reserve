package kr.it.reserve.advertisement.scheduler;

import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.advertisement.service.AdPaymentLedgerService;
import kr.it.reserve.advertisement.service.AdPaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.time.LocalDateTime;

/** 미결 대사와 소량의 기존 광고 이관. 전체 광고/기간을 매 주기 PG에 조회하지 않는다. */
@Component
@ConditionalOnProperty(name = "advertisement.payments.reconciliation-enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class AdPaymentReconciliationScheduler {
    private final AdPaymentAttemptRepository attempts;
    private final AdvertisementRepository ads;
    private final AdPaymentLedgerService ledger;
    private final AdPaymentService payments;

    @Scheduled(fixedDelayString = "${advertisement.payments.reconcile-delay-ms:300000}", initialDelay = 300000)
    public void reconcile() {
        for (Long id : ads.findWithoutPaymentAttempt(PageRequest.of(0, 10))) {
            try { ledger.importLegacy(id); }
            catch (RuntimeException e) { log.error("Advertisement ledger import failed: adId={}, errorType={}", id, e.getClass().getSimpleName()); }
        }
        for (String uid : attempts.findDue(LocalDateTime.now(), PageRequest.of(0, 10))) {
            try { payments.reconcile(uid, null); }
            catch (RuntimeException e) { log.error("Advertisement payment reconciliation failed: errorType={}", e.getClass().getSimpleName()); }
        }
    }
}
