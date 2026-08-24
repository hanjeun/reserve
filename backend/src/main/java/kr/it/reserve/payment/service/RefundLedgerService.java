package kr.it.reserve.payment.service;

import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 환불 원장 기록 — 2026-08-23 신설.
 *
 * <h2>★ 모든 메서드가 {@code REQUIRES_NEW} 인 이유 — 이게 이 클래스의 전부다</h2>
 * 원장이 호출자(환불 트랜잭션)와 <b>같은 트랜잭션</b>에 있으면,
 * 환불이 실패해 롤백될 때 <b>"실패했다는 기록까지 같이 사라진다."</b>
 * 그건 기록이 가장 필요한 순간에 기록이 없어지는 것이고, 정확히 지금 고치려는 문제다.
 *
 * <p>별도 트랜잭션이라 이런 그림이 가능해진다 — 원장에는 "3만원 환불 시도, REQUESTED" 가 남았는데
 * 결제는 여전히 PAID. <b>이 어긋남은 버그가 아니라 신호다.</b> "PG 를 부르다가 끊겼으니
 * 사람이 PortOne 콘솔에서 확인하라"는 뜻이고, 그 확인 대상을 뽑을 수 있게 하는 게 원장의 목적이다.
 *
 * <h2>원장 기록이 실패해도 환불은 계속된다</h2>
 * 여기서 예외를 밖으로 던지면 <b>기록 실패가 환불 실패가 된다</b> — 손님 입장에서 훨씬 나쁘다.
 * 그래서 모든 메서드가 예외를 삼키고 {@code log.error} 로만 남긴다.
 * 이건 "조용히 실패해도 된다"는 뜻이 아니라 <b>우선순위</b>다: 돈 > 기록.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundLedgerService {

    private final RefundAttemptRepository refundAttemptRepository;

    /**
     * PG 를 부르기 <b>직전</b>에 원장 행을 만들고 <b>즉시 커밋</b>한다.
     *
     * @return 원장 행 ID. 기록에 실패하면 {@code null} — 호출측은 null 을 받아도 환불을 계속해야 한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long start(Long paymentId, String merchantUid, Integer requestedAmount, String reason) {
        try {
            // 결제를 ID 로만 참조한다 — 엔티티를 끌어오지 않으므로 payment 행을 건드리지 않는다.
            // 그게 이 별도 트랜잭션이 바깥의 행 잠금과 교착하지 않는 이유다
            // (RefundAttempt#paymentId 주석 참고).
            RefundAttempt attempt = RefundAttempt.start(paymentId, merchantUid, requestedAmount, reason);
            Long id = refundAttemptRepository.save(attempt).getId();
            log.info("Refund attempt opened: attemptId={}, paymentId={}, merchantUid={}, amount={}",
                    id, paymentId, merchantUid, requestedAmount);
            return id;
        } catch (Exception e) {
            log.error("Failed to open refund ledger entry: paymentId={}, merchantUid={}, amount={}",
                    paymentId, merchantUid, requestedAmount, e);
            return null;
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeeded(Long attemptId, String cancellationId, Integer cancelledAmount) {
        update(attemptId, a -> a.markSucceeded(cancellationId, cancelledAmount),
                "SUCCEEDED", cancellationId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void pending(Long attemptId, String cancellationId, String note) {
        update(attemptId, a -> a.markPending(cancellationId, note), "PENDING", cancellationId);
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
            // start() 가 실패했던 경우. 결말을 적을 행이 없다 — 최소한 로그로는 남긴다.
            log.error("Refund outcome has no ledger row to write to: outcome={}, cancellationId={}",
                    label, cancellationId);
            return;
        }
        try {
            refundAttemptRepository.findById(attemptId).ifPresentOrElse(
                    attempt -> {
                        mutation.accept(attempt);
                        refundAttemptRepository.save(attempt);
                        // RESOLVE_ATTEMPT 는 "닫혔다"가 아니라 "한 번 더 물어봤다"이다.
                        // 로그 문구가 실제와 다르면 나중에 로그로 판단할 때 그대로 오독한다.
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
            log.error("Failed to close refund ledger entry: attemptId={}, outcome={}", attemptId, label, e);
        }
    }
}
