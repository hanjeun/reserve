package kr.it.reserve.payment.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.payment.dto.PaymentReconciliationIssueResponse;
import kr.it.reserve.payment.dto.PaymentWebhookInboxResponse;
import kr.it.reserve.payment.dto.StaleReadyPaymentResponse;
import kr.it.reserve.payment.dto.StaleReadyReconciliationResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

/**
 * 결제 자동 처리에서 결말을 단정하지 못한 건과 durable webhook inbox를 조회하는 관리자 큐.
 * 응답에는 PII와 웹훅 원문·해시가 포함되지 않는다.
 */
@RestController
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@RequestMapping("/api/admin/payment-operations")
public class PaymentOperationsAdminController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final String DEFAULT_STALE_READY_DAYS = "7";
    private static final int MAX_STALE_READY_DAYS = 3650;

    private final PaymentReconciliationIssueRepository issueRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentWebhookInboxRepository inboxRepository;
    private final PaymentWebhookInboxProcessor inboxProcessor;
    private final PaymentService paymentService;

    @GetMapping("/issues")
    @Transactional(readOnly = true)
    public ApiResponse<Page<PaymentReconciliationIssueResponse>> issues(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "true") boolean openOnly) {
        Pageable pageable = boundedPage(page, size);
        Page<PaymentReconciliationIssue> issues = openOnly
                ? issueRepository.findByStatusOrderByLastSeenAtDesc(
                        PaymentReconciliationIssue.IssueStatus.OPEN, pageable)
                : issueRepository.findAllByOrderByLastSeenAtDesc(pageable);
        return ApiResponse.success(issues.map(PaymentReconciliationIssueResponse::from), "조회 성공");
    }

    @GetMapping("/issues/open-count")
    public ApiResponse<Long> openIssueCount() {
        return ApiResponse.success(
                issueRepository.countByStatus(PaymentReconciliationIssue.IssueStatus.OPEN),
                "조회 성공");
    }

    @GetMapping("/webhooks")
    @Transactional(readOnly = true)
    public ApiResponse<Page<PaymentWebhookInboxResponse>> webhooks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "true") boolean unfinishedOnly) {
        Pageable pageable = boundedPage(page, size);
        Page<PaymentWebhookInbox> webhooks = unfinishedOnly
                ? inboxRepository.findByStatusInOrderByReceivedAtDesc(
                        PaymentWebhookInbox.UNFINISHED, pageable)
                : inboxRepository.findAllByOrderByReceivedAtDesc(pageable);
        return ApiResponse.success(webhooks.map(PaymentWebhookInboxResponse::from), "조회 성공");
    }

    @GetMapping("/webhooks/unfinished-count")
    public ApiResponse<Long> unfinishedWebhookCount() {
        return ApiResponse.success(
                inboxRepository.countByStatusIn(PaymentWebhookInbox.UNFINISHED),
                "조회 성공");
    }

    /** 자동 만료 대상에서 벗어나 장기간 남은 READY 결제를 오래된 순서로 조회한다. */
    @GetMapping("/stale-ready")
    @Transactional(readOnly = true)
    public ApiResponse<Page<StaleReadyPaymentResponse>> staleReadyPayments(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = DEFAULT_STALE_READY_DAYS) int olderThanDays) {
        int safeDays = Math.min(Math.max(1, olderThanDays), MAX_STALE_READY_DAYS);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(safeDays);
        Page<Payment> payments = paymentRepository.findStaleReadyPayments(
                cutoff,
                boundedPage(page, size));
        return ApiResponse.success(
                payments.map(StaleReadyPaymentResponse::from),
                "오래된 결제 준비 목록 조회 성공");
    }

    /** 선택한 READY 한 건을 PG에서 다시 조회해 안전한 경우만 자동 정리한다. */
    @PostMapping("/stale-ready/{paymentId}/reconcile")
    public ApiResponse<StaleReadyReconciliationResponse> reconcileStaleReadyPayment(
            @PathVariable Long paymentId) {
        return ApiResponse.success(
                paymentService.reconcileStaleReadyPayment(paymentId),
                "결제 상태 재확인 완료");
    }

    /** 자동 backoff를 기다리지 않고 선택한 inbox 건을 같은 멱등 처리 관문으로 재시도한다. */
    @PostMapping("/webhooks/{inboxId}/retry")
    public ApiResponse<String> retryWebhook(@PathVariable Long inboxId) {
        PaymentWebhookInbox inbox = inboxRepository.findById(inboxId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "웹훅 inbox 항목을 찾을 수 없습니다."));
        inboxProcessor.retryNow(inbox.getWebhookId());
        return ApiResponse.success(inbox.getWebhookId(), "재처리 요청 완료");
    }

    private Pageable boundedPage(int page, int size) {
        return PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(1, size), MAX_PAGE_SIZE));
    }
}
