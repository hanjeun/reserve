package kr.it.reserve.payment.scheduler;

import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import kr.it.reserve.payment.service.RefundSettlementPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 미결 환불 재조회 — 2026-08-23 신설.
 *
 * <h2>무엇을 해결하나</h2>
 * 환불에는 "성공"과 "실패" 말고 <b>"모른다"</b>가 있다. PG 가 접수만 하고 결말을 나중에 주거나
 * (REQUESTED), 우리가 응답을 못 받았거나, 본문이 비어 있는 경우다.
 * 그 상태로 두면 결제는 {@code REFUND_PENDING} 에 갇히고 손님은 재시도도 못 한다.
 * 이 스케줄러가 <b>PG 에 다시 물어봐서</b> 결말을 확정한다.
 *
 * <h2>왜 "재시도"가 아니라 "재조회"인가</h2>
 * 취소를 다시 <b>보내면</b> 이중 환불 위험이 생긴다 — 앞의 요청이 사실은 성공했을 수 있기 때문이다.
 * 그래서 이 스케줄러는 절대 취소를 다시 보내지 않고 <b>상태만 읽는다.</b>
 * 실패로 확정되면 결제를 PAID 로 되돌려, 다시 보낼지는 <b>사람이나 손님이</b> 정하게 한다.
 *
 * <h2>자동 확정 조건</h2>
 * 상태 문자열 하나로 단정하지 않는다. 누적 취소액, 개별 취소 ID·상태·금액을
 * {@link RefundSettlementPolicy} 한 곳에서 대조하고, 모두 일치할 때만 성공 또는 실패로 닫는다.
 * 한 결제에 미결 시도가 둘 이상이거나 PG 자료가 서로 충돌하면 자동 변경하지 않고
 * 운영 대사 큐에 남긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefundReconciliationScheduler {

    /** 방금 만들어진 원장 행은 건드리지 않는다 — 지금 환불이 진행 중일 수 있다. */
    private static final Duration SETTLE_DELAY = Duration.ofMinutes(2);

    /** 이 횟수를 넘도록 결말이 안 나면 자동 판정을 포기하고 사람을 부른다. */
    private static final int GIVE_UP_AFTER_ATTEMPTS = 20;

    private final RefundAttemptRepository refundAttemptRepository;
    private final PaymentRepository paymentRepository;
    private final PortoneService portoneService;
    private final PaymentService paymentService;
    private final RefundLedgerService refundLedgerService;
    private final PaymentReconciliationIssueService reconciliationIssueService;

    /**
     * 5분마다. 미결 건이 없으면 아무 일도 하지 않는다(정상 상태).
     *
     * <p>{@code fixedDelay} 라 앞 회차가 끝난 뒤 5분을 센다 — PG 응답이 느려도 회차가 겹치지 않는다.
     */
    @Scheduled(fixedDelay = 5 * 60 * 1000, initialDelay = 60 * 1000)
    public void reconcileUnresolvedRefunds() {
        LocalDateTime cutoff = LocalDateTime.now().minus(SETTLE_DELAY);
        List<UnresolvedRefundView> unresolved =
                refundAttemptRepository.findUnresolvedBefore(RefundAttempt.UNRESOLVED, cutoff);

        if (unresolved.isEmpty()) {
            return;
        }
        log.info("Refund reconciliation started: unresolved={}", unresolved.size());

        for (UnresolvedRefundView view : unresolved) {
            // 목록은 2분 이전 행만 담지만, 중복 판정은 방금 생긴 미결까지 전부 센다.
            // 그렇지 않으면 오래된 행 하나 + 진행 중인 새 행 하나를 단일 시도로 오인한다.
            if (refundAttemptRepository.countByPaymentIdAndStatusIn(
                    view.paymentId(), RefundAttempt.UNRESOLVED) > 1) {
                recordIssue(view, "MULTIPLE_UNRESOLVED_REFUND_ATTEMPTS");
                log.error("Refund reconciliation skipped - multiple unresolved attempts for one payment: "
                                + "paymentId={}, merchantUid={}. Resolve manually in the PortOne console.",
                        view.paymentId(), view.merchantUid());
                continue;
            }
            try {
                reconcileOne(view);
            } catch (Exception e) {
                // 한 건이 터져도 나머지는 계속 본다.
                log.error("Refund reconciliation failed for one attempt: attemptId={}, merchantUid={}",
                        view.attemptId(), view.merchantUid(), e);
            }
        }
    }

    /**
     * 한 건 처리. {@code @Transactional} 을 걸지 <b>않는다</b> — 안에서 부르는
     * {@code paymentService}·{@code refundLedgerService} 가 각자 트랜잭션을 열고,
     * 그 사이에 <b>느린 외부 HTTP 호출</b>이 끼어 있다. 하나로 묶으면 PG 응답을 기다리는 동안
     * 결제 행 잠금을 쥐고 있게 된다.
     */
    void reconcileOne(UnresolvedRefundView view) {
        Long attemptId = view.attemptId();
        Long paymentId = view.paymentId();
        String merchantUid = view.merchantUid();
        Integer requestedAmount = view.requestedAmount();
        String reason = view.reason();
        String cancellationId = view.cancellationId();
        int priorAttempts = view.resolveAttempts();

        refundLedgerService.recordResolveAttempt(attemptId);

        PortoneV2PaymentResponse pgPayment;
        try {
            pgPayment = portoneService.getPaymentInfo(merchantUid);
        } catch (Exception e) {
            log.warn("Refund reconciliation could not read PG state: merchantUid={}, attempts={}",
                    merchantUid, priorAttempts + 1);
            warnIfStuck(attemptId, merchantUid, priorAttempts + 1);
            return;
        }

        Payment payment = paymentRepository.findById(paymentId).orElse(null);
        if (payment == null) {
            recordIssue(view, "LOCAL_PAYMENT_MISSING");
            log.error("Refund reconciliation cannot find local payment: paymentId={}, merchantUid={}",
                    paymentId, merchantUid);
            warnIfStuck(attemptId, merchantUid, priorAttempts + 1);
            return;
        }
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING) {
            recordIssue(view, "LOCAL_PAYMENT_STATUS_" + payment.getStatus());
            log.error("Refund ledger and local payment status disagree: paymentId={}, localStatus={}",
                    paymentId, payment.getStatus());
            return;
        }

        RefundSettlementPolicy.Assessment assessment = RefundSettlementPolicy.assess(
                payment.refundedSoFar(), requestedAmount, cancellationId, pgPayment);
        String pgStatus = pgPayment.getStatus();
        switch (assessment.outcome()) {
            case SUCCEEDED -> {
                boolean accepted = paymentService.confirmPendingRefund(
                        paymentId, payment.refundedSoFar(), assessment.confirmedAmount(), reason);
                if (!accepted) {
                    recordIssue(view, "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_SUCCESS");
                    log.error("Refund success conflicts with current local state: merchantUid={}, detailCode={}",
                            merchantUid, assessment.detailCode());
                    return;
                }
                refundLedgerService.succeeded(
                        attemptId, assessment.cancellationId(), assessment.confirmedAmount());
                resolveIssues(paymentId);
                log.info("Refund reconciled as succeeded: merchantUid={}, pgStatus={}, detailCode={}",
                        merchantUid, pgStatus, assessment.detailCode());
            }
            case FAILED -> {
                String note = "PG cancellation is explicitly FAILED";
                boolean accepted = paymentService.revertPendingRefund(
                        paymentId, payment.refundedSoFar(), note);
                if (!accepted) {
                    recordIssue(view, "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_FAILURE");
                    log.error("Refund failure conflicts with current local state: merchantUid={}, detailCode={}",
                            merchantUid, assessment.detailCode());
                    return;
                }
                refundLedgerService.failed(attemptId, note);
                resolveIssues(paymentId);
                log.error("Refund reconciled as failed: merchantUid={}, detailCode={}",
                        merchantUid, assessment.detailCode());
            }
            case PENDING -> {
                log.info("Refund still unresolved: merchantUid={}, pgStatus={}, attempts={}, detailCode={}",
                        merchantUid, pgStatus, priorAttempts + 1, assessment.detailCode());
                warnIfStuck(attemptId, merchantUid, priorAttempts + 1);
            }
            case REVIEW_REQUIRED -> {
                recordIssue(view, assessment.detailCode());
                log.error("Refund reconciliation requires manual review: merchantUid={}, pgStatus={}, detailCode={}",
                        merchantUid, pgStatus, assessment.detailCode());
                warnIfStuck(attemptId, merchantUid, priorAttempts + 1);
            }
        }
    }

    private void recordIssue(UnresolvedRefundView view, String detailCode) {
        try {
            reconciliationIssueService.record(
                    "REFUND:" + view.paymentId(),
                    PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                    view.paymentId(),
                    null,
                    view.merchantUid(),
                    detailCode);
        } catch (RuntimeException e) {
            log.error("Refund reconciliation issue could not be persisted: paymentId={}, errorType={}",
                    view.paymentId(), e.getClass().getSimpleName());
        }
    }

    private void resolveIssues(Long paymentId) {
        try {
            reconciliationIssueService.resolveForPayment(paymentId);
        } catch (RuntimeException e) {
            log.error("Refund reconciliation issue could not be resolved: paymentId={}, errorType={}",
                    paymentId, e.getClass().getSimpleName());
        }
    }

    /**
     * 오래 붙잡힌 건은 <b>ERROR 로</b> 남긴다. Grafana 의 ERROR 급증 알림이 이걸 집어 사람을 깨운다 —
     * 조용히 계속 재조회만 하면 "자동으로 처리되고 있다"는 착각을 준다.
     */
    private void warnIfStuck(Long attemptId, String merchantUid, int attempts) {
        if (attempts >= GIVE_UP_AFTER_ATTEMPTS) {
            log.error("Refund stuck unresolved - manual check required: attemptId={}, merchantUid={}, attempts={}",
                    attemptId, merchantUid, attempts);
        }
    }
}
