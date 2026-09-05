package kr.it.reserve.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneWebhookSignal;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * PortOne 웹훅 처리 — 2026-08-23 신설.
 *
 * <h2>왜 웹훅이 필요했나</h2>
 * 예전에는 결제 결과를 <b>브라우저가 돌아와서 알려줄 때만</b> 알 수 있었다.
 * 손님이 결제 직후 창을 닫거나 통신이 끊기면 우리는 영영 모른다. 그 상태로 두면
 * 스케줄러가 <b>환불 없이 예약만 자동 취소</b>했다 — 돈은 받고 예약은 없애는 최악의 경우다.
 * 웹훅은 브라우저와 무관하게 PG 가 직접 알려주는 경로다.
 *
 * <h2>★ 웹훅 본문의 값을 그대로 믿지 않는다</h2>
 * 서명이 맞아도 본문은 <b>"무엇이 바뀌었는지 알려주는 신호"</b>로만 쓰고,
 * 실제 상태는 {@link PortoneService#getPaymentInfo} 로 <b>우리가 다시 물어본다.</b>
 * 이유는 두 가지다 — ① 웹훅은 순서가 뒤바뀌어 도착할 수 있어서 오래된 사실을 최신처럼 적용할 위험이 있고,
 * ② 조회 API 가 언제나 최종 권위다. 신호와 사실을 분리하면 재전송·중복도 자연히 안전해진다.
 *
 * <h2>멱등과 재처리</h2>
 * 같은 웹훅이 여러 번 올 수 있으므로 {@link PaymentWebhookInboxProcessor}가 {@code webhook-id}를
 * durable inbox에 먼저 기록한다. 이 서비스의 상태 전이도 조건부로 유지해, inbox 기록 직후
 * 서버가 죽어 같은 결제를 다시 처리해도 두 번 반영되지 않게 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PortoneWebhookService {

    private final ObjectMapper objectMapper;
    private final PortoneService portoneService;
    private final PaymentService paymentService;
    private final PaymentRepository paymentRepository;
    private final RefundAttemptRepository refundAttemptRepository;
    private final RefundLedgerService refundLedgerService;
    private final PaymentReconciliationIssueService reconciliationIssueService;

    /** 서명 검증을 통과한 원문에서 저장할 최소 신호만 추출한다. */
    public PortoneWebhookSignal parseSignal(String rawBody) {
        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (Exception e) {
            log.error("PortOne webhook body is not valid JSON: errorType={}",
                    e.getClass().getSimpleName());
            return PortoneWebhookSignal.invalidJson();
        }

        if (root == null || root.isNull()) {
            return PortoneWebhookSignal.invalidJson();
        }

        String type = text(root, "type");
        String merchantUid = extractPaymentId(root);    // V2 의 결제 식별자 = 우리 merchantUid

        return new PortoneWebhookSignal(type, merchantUid, true);
    }

    /** inbox에 저장된 결제 ID를 사용해 PG 권위 상태를 조회하고 반영한다. */
    public void processMerchantUid(String merchantUid) {
        PortoneV2PaymentResponse pgPayment;
        try {
            pgPayment = portoneService.getPaymentInfo(merchantUid);
        } catch (Exception e) {
            // 여기서 예외를 밖으로 내보내면 컨트롤러가 5xx 를 주고 PortOne 이 재전송한다.
            // 일시적 장애라면 재전송이 오히려 도움이 되므로 컨트롤러 쪽에서 판단하게 그대로 던진다.
            log.error("PortOne webhook could not read PG state: merchantUid={}, errorType={}",
                    merchantUid, e.getClass().getSimpleName());
            throw e;
        }

        applyPgState(merchantUid, pgPayment);
    }

    /**
     * PG 가 말하는 현재 상태를 우리 쪽에 반영한다.
     * READY 결제의 PAID 복구와 REFUND_PENDING 결말 확정을 각각 기존 PaymentService 관문으로 보낸다.
     */
    public void applyPgState(String merchantUid, PortoneV2PaymentResponse pgPayment) {
        Payment payment = paymentRepository.findByMerchantUid(merchantUid).orElse(null);
        if (payment == null) {
            // 다른 상점·다른 환경(로컬 테스트)의 웹훅일 수 있다. 에러가 아니다.
            log.info("PortOne webhook ignored - unknown merchantUid: {}", merchantUid);
            return;
        }

        String pgStatus = pgPayment.getStatus();
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING) {
            if (pgPayment.isPaid()) {
                PaymentService.PaidRecoveryResult result =
                        paymentService.recoverPaidPaymentFromPg(merchantUid, pgPayment);
                log.info("Payment PAID state reconciled by webhook: merchantUid={}, result={}",
                        merchantUid, result);
                return;
            }
            log.debug("PortOne webhook has nothing to settle: merchantUid={}, localStatus={}, pgStatus={}",
                    merchantUid, payment.getStatus(), pgStatus);
            return;
        }

        List<RefundAttempt> attempts = refundAttemptRepository
                .findByPaymentIdOrderByCreatedAtAsc(payment.getId());
        RefundAttempt pending = attempts.stream()
                .filter(RefundAttempt::isUnresolved)
                .reduce((first, second) -> second)   // 가장 최근 미결 건
                .orElse(null);

        if (pending == null) {
            recordIssue(payment, "REFUND:" + payment.getId(),
                    PaymentReconciliationIssue.IssueType.REFUND_LEDGER_MISSING,
                    "REFUND_PENDING_WITHOUT_UNRESOLVED_ATTEMPT");
            log.error("Payment is REFUND_PENDING but has no unresolved ledger entry: merchantUid={}", merchantUid);
            return;
        }

        switch (pgStatus == null ? "" : pgStatus) {
            case "CANCELLED", "PARTIAL_CANCELLED" -> {
                paymentService.confirmPendingRefund(
                        payment.getId(), pending.getRequestedAmount(), pending.getReason());
                refundLedgerService.succeeded(pending.getId(), pending.getCancellationId(),
                        pending.getRequestedAmount());
                resolveIssues(payment);
                log.info("Refund settled by webhook: merchantUid={}, pgStatus={}", merchantUid, pgStatus);
            }
            case "PAID" -> {
                String note = "PG reports PAID via webhook after cancellation request";
                paymentService.revertPendingRefund(payment.getId(), note);
                refundLedgerService.failed(pending.getId(), note);
                resolveIssues(payment);
                log.error("Refund failed per webhook: merchantUid={}", merchantUid);
            }
            default -> log.info("PortOne webhook did not settle anything: merchantUid={}, pgStatus={}",
                    merchantUid, pgStatus);
        }
    }

    /**
     * 본문에서 결제 식별자를 꺼낸다. <b>포트원 웹훅 버전 두 가지를 모두 받는다.</b>
     *
     * <pre>
     * 2024-04-25 (권장)  {"type":"Transaction.Cancelled","timestamp":"2024-04-25T10:00:00.000Z",
     *                     "data":{"paymentId":"...","storeId":"...","transactionId":"..."}}
     * 2024-01-01 (구)    {"payment_id":"...","tx_id":"...","status":"Ready"}
     * </pre>
     *
     * <h3>왜 둘 다 받나</h3>
     * 버전을 정하는 건 <b>포트원 콘솔의 드롭다운</b>이다 — 즉 우리 코드 밖에서 바뀔 수 있고,
     * 신규 등록 화면의 기본값이 구버전(2024-01-01)이다.
     * 한쪽만 읽으면 다른 쪽이 선택됐을 때 <b>서명은 통과하고 본문만 조용히 버려진다.</b>
     * 컨트롤러는 200 을 돌려주므로 포트원 콘솔에는 "정상 전송"으로 찍히고 재전송도 오지 않는다 —
     * <b>어디에도 에러가 남지 않는</b> 종류의 고장이고, 이 프로젝트가 반복해서 당한 형태다
     * (메일 3주 미발송, 웹훅 시크릿 미배선).
     *
     * <h3>구버전을 받아도 안전한 이유</h3>
     * 우리는 본문의 {@code status} 를 쓰지 않는다. 본문은 "무엇이 바뀌었는지"의 <b>신호</b>일 뿐이고
     * 실제 상태는 조회 API 로 다시 물어본다(클래스 주석 참고).
     * 그래서 <b>결제 식별자 하나만 확보되면 두 버전이 완전히 같은 경로로 처리된다.</b>
     */
    private static String extractPaymentId(JsonNode root) {
        String current = text(root.path("data"), "paymentId");
        if (current != null && !current.isBlank()) {
            return current;
        }

        String legacy = text(root, "payment_id");
        if (legacy != null && !legacy.isBlank()) {
            // 동작은 하지만 콘솔 설정을 바꾸는 게 맞다 — 구버전에는 type 이 없어서
            // 어떤 이벤트로 깨어난 것인지 로그에서 구분할 수 없다.
            log.warn("PortOne webhook is on the legacy 2024-01-01 format - "
                    + "change the console webhook version to 2024-04-25: merchantUid={}", legacy);
            return legacy;
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText() : null;
    }

    private void recordIssue(
            Payment payment,
            String issueKey,
            PaymentReconciliationIssue.IssueType issueType,
            String detailCode) {
        try {
            reconciliationIssueService.record(
                    issueKey,
                    issueType,
                    payment.getId(),
                    null,
                    payment.getMerchantUid(),
                    detailCode);
        } catch (RuntimeException e) {
            log.error("Webhook reconciliation issue could not be persisted: paymentId={}, issueType={}, errorType={}",
                    payment.getId(), issueType, e.getClass().getSimpleName());
        }
    }

    private void resolveIssues(Payment payment) {
        try {
            reconciliationIssueService.resolveForPayment(payment.getId());
        } catch (RuntimeException e) {
            log.error("Webhook reconciliation issue could not be resolved: paymentId={}, errorType={}",
                    payment.getId(), e.getClass().getSimpleName());
        }
    }
}
