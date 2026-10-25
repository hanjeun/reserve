package kr.it.reserve.payment.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.payment.dto.RefundAttemptResponse;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 관리자 전용 읽기 경로이며 원장을 직접 수정하지 않는다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/refunds")
public class RefundLedgerAdminController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final String QUERY_SUCCESS = "조회 성공";

    private final RefundAttemptRepository refundAttemptRepository;

    /**
     * 환불 시도 목록.
     *
     * @param unresolvedOnly true 면 미결(REQUESTED·PENDING)만. 기본값 false.
     */
    @GetMapping
    @Transactional(readOnly = true)
    public ApiResponse<Page<RefundAttemptResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "false") boolean unresolvedOnly) {

        // size 를 그대로 믿지 않는다 — 큰 값이 들어오면 한 번에 전건을 끌어온다.
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.clamp(size, 1, MAX_PAGE_SIZE));

        Page<RefundAttempt> attempts = unresolvedOnly
                ? refundAttemptRepository.findByStatusInOrderByCreatedAtDesc(RefundAttempt.UNRESOLVED, pageable)
                : refundAttemptRepository.findAllByOrderByCreatedAtDesc(pageable);

        return ApiResponse.success(attempts.map(RefundAttemptResponse::from), QUERY_SUCCESS);
    }

    /** 미결 건수만. 대시보드 타일용 — <b>0 이 정상</b>이다. */
    @GetMapping("/unresolved-count")
    public ApiResponse<Long> unresolvedCount() {
        return ApiResponse.success(
                refundAttemptRepository.countByStatusIn(RefundAttempt.UNRESOLVED), QUERY_SUCCESS);
    }

    /** 특정 결제의 시도 이력 — 대사용. */
    @GetMapping("/by-payment/{paymentId}")
    @Transactional(readOnly = true)
    public ApiResponse<List<RefundAttemptResponse>> byPayment(@PathVariable Long paymentId) {
        List<RefundAttemptResponse> history = refundAttemptRepository
                .findByPaymentIdOrderByCreatedAtAsc(paymentId)
                .stream()
                .map(RefundAttemptResponse::from)
                .toList();
        return ApiResponse.success(history, QUERY_SUCCESS);
    }
}
