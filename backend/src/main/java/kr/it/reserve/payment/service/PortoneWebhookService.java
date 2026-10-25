package kr.it.reserve.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.service.AdPaymentService;
import kr.it.reserve.payment.dto.PortoneWebhookSignal;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
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
 * 서명 검증된 웹훅은 결제 변경 신호로만 사용하고 상태는 PortOne 조회로 다시 확인한다.
 * webhook-id는 PaymentWebhookInboxProcessor가 내구 inbox에 기록해 재처리한다.
 * 신호의 순서가 바뀌거나 재전송되어도 중복 반영되지 않도록 상태 전이를 조건부로 적용한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PortoneWebhookService {
    private static final String REFUND_ISSUE_PREFIX = "REFUND:";

    private final ObjectMapper objectMapper;
    private final AdPaymentService adPaymentService;
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

    /**
     * inbox에 저장된 결제 ID를 사용해 PG 권위 상태를 조회하고 반영한다.
     *
     * <p>로컬 결제 행이 없으면 PortOne 호출 테스트나 다른 환경의 신호이므로 종료한다.
     * 반영할 로컬 상태가 없는데 PG를 먼저 조회하면 존재하지 않는 테스트 결제의 404가
     * 정상 호출 테스트를 실패한 웹훅으로 남겨 불필요한 재시도를 만든다.
     */
    public ProcessingResult processMerchantUid(String merchantUid) {
        Payment payment = paymentRepository.findByMerchantUid(merchantUid).orElse(null);
        if (payment == null && adPaymentService.isKnown(merchantUid)) {
            if (!adPaymentService.reconcile(merchantUid, null)) {
                throw new IllegalStateException("Advertisement payment reconciliation deferred");
            }
            return ProcessingResult.PROCESSED;
        }
        if (payment == null) {
            log.info("PortOne webhook ignored - unknown merchantUid: {}", merchantUid);
            return ProcessingResult.IGNORED_UNKNOWN_PAYMENT;
        }

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

        applyPgState(payment, pgPayment);
        return ProcessingResult.PROCESSED;
    }

    /**
     * PG 가 말하는 현재 상태를 우리 쪽에 반영한다.
     * READY 결제의 PAID 복구와 REFUND_PENDING 결말 확정을 각각 기존 PaymentService 관문으로 보낸다.
     */
    private void applyPgState(Payment payment, PortoneV2PaymentResponse pgPayment) {
        String merchantUid = payment.getMerchantUid();
        String pgStatus = pgPayment.getStatus();
        boolean recordedRefund = payment.getStatus() == Payment.PaymentStatus.REFUNDED
                || payment.getStatus() == Payment.PaymentStatus.PARTIAL_REFUNDED;
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING && !recordedRefund) {
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
        List<RefundAttempt> unresolved = attempts.stream()
                .filter(RefundAttempt::isUnresolved)
                .toList();

        if (unresolved.isEmpty()) {
            if (recordedRefund) return;
            recordIssue(payment, REFUND_ISSUE_PREFIX + payment.getId(),
                    PaymentReconciliationIssue.IssueType.REFUND_LEDGER_MISSING,
                    "REFUND_PENDING_WITHOUT_UNRESOLVED_ATTEMPT");
            log.error("Payment is REFUND_PENDING but has no unresolved ledger entry: merchantUid={}", merchantUid);
            return;
        }
        if (unresolved.size() > 1) {
            recordIssue(payment, REFUND_ISSUE_PREFIX + payment.getId(),
                    PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                    "MULTIPLE_UNRESOLVED_REFUND_ATTEMPTS");
            log.error("Refund webhook skipped - multiple unresolved attempts: merchantUid={}, count={}",
                    merchantUid, unresolved.size());
            return;
        }
        RefundAttempt pending = unresolved.get(0);
        if (pending.isReadyToDispatch()) return;
        UnresolvedRefundView view = new UnresolvedRefundView(pending.getId(), payment.getId(),
                merchantUid, pending.getRequestedAmount(), pending.getCancellationId(),
                pending.getReason(), pending.getResolveAttempts());

        RefundSettlementPolicy.LocalAssessment local = RefundSettlementPolicy.assessLocalState(
                payment.getStatus(), payment.refundedSoFar(),
                pending.getRequestedAmount(),
                pending.getCancellationId(),
                pgPayment);
        RefundSettlementPolicy.Assessment assessment = local.assessment();

        switch (assessment.outcome()) {
            case SUCCEEDED -> {
                boolean accepted = paymentService.confirmPendingRefund(
                        view, local.priorRefundedAmount(), assessment.confirmedAmount(), assessment.cancellationId());
                if (!accepted) {
                    recordIssue(payment, REFUND_ISSUE_PREFIX + payment.getId(),
                            PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                            "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_SUCCESS");
                    log.error("Refund webhook success conflicts with current local state: merchantUid={}", merchantUid);
                    return;
                }
                resolveIssues(payment);
                log.info("Refund settled by webhook: merchantUid={}, pgStatus={}, detailCode={}",
                        merchantUid, pgStatus, assessment.detailCode());
            }
            case FAILED -> {
                String note = "PG cancellation is explicitly FAILED";
                boolean accepted = paymentService.revertPendingRefund(
                        view, local.priorRefundedAmount(), assessment.cancellationId(), note);
                if (!accepted) {
                    recordIssue(payment, REFUND_ISSUE_PREFIX + payment.getId(),
                            PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                            "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_FAILURE");
                    log.error("Refund webhook failure conflicts with current local state: merchantUid={}", merchantUid);
                    return;
                }
                resolveIssues(payment);
                log.error("Refund failed per webhook: merchantUid={}, detailCode={}",
                        merchantUid, assessment.detailCode());
            }
            case PENDING -> log.info(
                    "Refund remains pending after webhook: merchantUid={}, pgStatus={}, detailCode={}",
                    merchantUid, pgStatus, assessment.detailCode());
            case REVIEW_REQUIRED -> {
                recordIssue(payment, REFUND_ISSUE_PREFIX + payment.getId(),
                        PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                        assessment.detailCode());
                log.error("Refund webhook requires manual reconciliation: merchantUid={}, pgStatus={}, detailCode={}",
                        merchantUid, pgStatus, assessment.detailCode());
            }
        }
    }

    /** 본문 규격별 결제 ID(2024-04-25: data.paymentId, 2024-01-01: payment_id)만 추출하고 PG의 상태를 재조회한다. */
    private static String extractPaymentId(JsonNode root) {
        String current = text(root.path("data"), "paymentId");
        if (current != null && !current.isBlank()) {
            return current;
        }

        String legacy = text(root, "payment_id");
        if (legacy != null && !legacy.isBlank()) {
            // 구형 본문에는 이벤트 type이 없어 경고를 남긴다.
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
            reconciliationIssueService.recordIssue(
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

    public enum ProcessingResult {
        PROCESSED,
        IGNORED_UNKNOWN_PAYMENT
    }
}
