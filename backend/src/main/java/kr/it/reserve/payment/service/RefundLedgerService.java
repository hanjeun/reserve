package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 미발신 의도는 예약 결정·결제 pending과 함께 저장한다. PG 발신 전 이 커밋이 반드시 끝나야 한다.
 * 웹훅·재조회 결말은 PaymentService에서 결제·예약금과 함께 확정하고, 재조회 횟수만 독립 저장한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundLedgerService {

    private final RefundAttemptRepository refundAttemptRepository;

    /** 예약 결정·결제 pending과 같은 트랜잭션에 미발신 의도를 저장한다. 실패하면 PG는 발신되지 않는다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Long prepare(Long paymentId, String merchantUid, Integer requestedAmount, String reason) {
        return refundAttemptRepository.save(
                RefundAttempt.prepare(paymentId, merchantUid, requestedAmount, reason)).getId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeeded(Long attemptId, String cancellationId, Integer cancelledAmount) {
        update(attemptId, a -> a.markSucceeded(cancellationId, cancelledAmount),
                "SUCCEEDED", cancellationId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void pending(Long attemptId, String cancellationId, String note) {
        update(attemptId, a -> a.markPending(cancellationId != null ? cancellationId : a.getCancellationId(), note),
                "PENDING", cancellationId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(Long attemptId, String failureReason) {
        update(attemptId, a -> a.markFailed(failureReason), "FAILED", null);
    }

    /**
     * 재조회를 1회 시도했다는 사실만 기록한다. 결말과 무관하게 올라가야
     * "몇 번을 물어봐도 결말이 안 나는 건"이 눈에 띈다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordResolveAttempt(Long attemptId) {
        update(attemptId, RefundAttempt::recordResolveAttempt, "RESOLVE_ATTEMPT", null);
    }

    private void update(Long attemptId, java.util.function.Consumer<RefundAttempt> mutation,
                        String label, String cancellationId) {
        if (attemptId == null) {
            // 내구 원장 ID가 없으면 결말을 적지 않고 진단만 남긴다.
            log.error("Refund outcome has no ledger row to write to: outcome={}, cancellationId={}",
                    label, cancellationId);
            return;
        }
        try {
            refundAttemptRepository.findByIdForUpdate(attemptId).ifPresentOrElse(
                    attempt -> {
                        if (!"RESOLVE_ATTEMPT".equals(label) && !attempt.isUnresolved()) {
                            log.debug("Refund ledger outcome already final: attemptId={}, status={}",
                                    attemptId, attempt.getStatus());
                            return;
                        }
                        mutation.accept(attempt);
                        refundAttemptRepository.save(attempt);
                        // RESOLVE_ATTEMPT는 환불 확정이 아닌 재조회 시도 기록이다.
                        if ("RESOLVE_ATTEMPT".equals(label)) {
                            log.debug("Refund attempt re-checked: attemptId={}, count={}",
                                    attemptId, attempt.getResolveAttempts());
                        } else {
                            log.info("Refund attempt closed: attemptId={}, outcome={}, cancellationId={}",
                                    attemptId, label, cancellationId);
                        }
                    },
                    () -> log.error("Refund ledger row vanished: attemptId={}, outcome={}", attemptId, label));
        } catch (Exception e) {
            log.error("Failed to close refund ledger entry: attemptId={}, outcome={}, errorType={}",
                    attemptId, label, e.getClass().getSimpleName());
        }
    }
}
