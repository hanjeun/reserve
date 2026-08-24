package kr.it.reserve.payment.scheduler;

import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
 * <h2>알고 감수하는 한계</h2>
 * PG 의 결제 <b>상태값</b>(CANCELLED / PARTIAL_CANCELLED / PAID)만 보고 판정한다.
 * 그래서 <b>한 결제에 미결 시도가 둘 이상이면 어느 것이 끝났는지 구분하지 못한다</b> —
 * 그 경우는 건드리지 않고 로그만 남겨 사람이 보게 한다. 이 규모(예약당 환불 1회)에서는
 * 사실상 나오지 않는 경우이고, 잘못 확정하는 것보다 미결로 두는 편이 낫다.
 *
 * <p>취소 <b>금액</b>도 PG 응답에서 읽지 않는다 — 응답의 금액 필드 구성을 문서로 확정하지 못했다.
 * 대신 원장에 남긴 {@code requestedAmount}(우리가 요청한 값)를 쓴다. 추측한 필드명으로
 * 돈을 적느니, 우리가 확실히 아는 값을 쓰고 대사는 PortOne 콘솔에서 하는 편이 안전하다.
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
    private final PortoneService portoneService;
    private final PaymentService paymentService;
    private final RefundLedgerService refundLedgerService;

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

        // 같은 결제에 미결이 둘 이상이면 어느 시도가 끝났는지 알 수 없다 — 위 "한계" 주석 참고.
        Map<Long, Long> perPayment = unresolved.stream()
                .collect(Collectors.groupingBy(UnresolvedRefundView::paymentId, Collectors.counting()));

        for (UnresolvedRefundView view : unresolved) {
            if (perPayment.getOrDefault(view.paymentId(), 0L) > 1) {
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

        String pgStatus = pgPayment.getStatus();
        switch (pgStatus == null ? "" : pgStatus) {
            case "CANCELLED", "PARTIAL_CANCELLED" -> {
                boolean changed = paymentService.confirmPendingRefund(paymentId, requestedAmount, reason);
                refundLedgerService.succeeded(attemptId, null, requestedAmount);
                log.info("Refund reconciled as succeeded: merchantUid={}, pgStatus={}, paymentChanged={}",
                        merchantUid, pgStatus, changed);
            }
            case "PAID" -> {
                // PG 에서 결제가 여전히 살아 있다 = 취소가 반영되지 않았다.
                String note = "PG still reports PAID after cancellation request";
                boolean changed = paymentService.revertPendingRefund(paymentId, note);
                refundLedgerService.failed(attemptId, note);
                log.error("Refund reconciled as failed: merchantUid={}, paymentReverted={}", merchantUid, changed);
            }
            default -> {
                // FAILED/READY/PENDING/VIRTUAL_ACCOUNT_ISSUED/PAY_PENDING 등 — 아직 판단하지 않는다.
                log.info("Refund still unresolved: merchantUid={}, pgStatus={}, attempts={}",
                        merchantUid, pgStatus, priorAttempts + 1);
                warnIfStuck(attemptId, merchantUid, priorAttempts + 1);
            }
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
