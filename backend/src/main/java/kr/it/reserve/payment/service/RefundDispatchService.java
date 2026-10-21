package kr.it.reserve.payment.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 취소 결정과 함께 커밋한 원장 ID만 실행한다. 미발신 작업은 정기 스케줄러도 회수한다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundDispatchService {
    private final PaymentService payments;
    private final PlatformTransactionManager transactionManager;

    @Transactional(propagation = Propagation.MANDATORY)
    public void afterCommit(Long attemptId) {
        if (attemptId == null) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // afterCommit에서도 이전 영속성 자원이 연결돼 있으므로 명시적으로 중단한다.
                TransactionTemplate suspended = new TransactionTemplate(transactionManager);
                suspended.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
                try {
                    suspended.executeWithoutResult(ignored -> payments.dispatchPreparedRefund(attemptId));
                } catch (RuntimeException e) {
                    log.error("Refund dispatch deferred after reservation commit: attemptId={}, errorType={}",
                            attemptId, e.getClass().getSimpleName());
                }
            }
        });
    }
}
