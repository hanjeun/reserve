package kr.it.reserve.payment.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.concurrent.Executor;

/** 커밋한 원장 ID만 발신하며 미발신 작업은 정기 스케줄러가 회수한다. */
@Slf4j
@Service
public class RefundDispatchService {
    private final PaymentService payments;
    private final Executor executor;
    public RefundDispatchService(PaymentService payments,
            @org.springframework.beans.factory.annotation.Qualifier("refundExecutor") Executor executor) {
        this.payments = payments; this.executor = executor;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void afterCommit(Long attemptId) {
        if (attemptId == null) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                // 요청의 연결 정리가 PG 응답을 기다리지 않도록 발신을 분리한다.
                try {
                    executor.execute(() -> {
                        try { payments.dispatchPreparedRefund(attemptId); }
                        catch (RuntimeException failure) {
                            log.error("Refund dispatch deferred: attemptId={}, errorType={}", attemptId, failure.getClass().getSimpleName());
                        }
                    });
                } catch (RuntimeException failure) {
                    log.warn("Refund dispatch queue unavailable: attemptId={}, errorType={}", attemptId, failure.getClass().getSimpleName());
                }
            }
        });
    }
}
