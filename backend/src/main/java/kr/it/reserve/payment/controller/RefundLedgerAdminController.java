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

/**
 * 환불 원장 조회 (관리자) — 2026-08-23 신설.
 *
 * <p>원장을 만들어놓고 <b>볼 방법이 없으면 만들지 않은 것과 같다.</b> 이 컨트롤러의 목적은
 * "미결 건이 지금 몇 개인가"에 언제든 답할 수 있게 하는 것이다.
 *
 * <p>경로가 {@code /api/admin/**} 이라 {@code SecurityConfig} 에서 ADMIN 롤이 강제된다.
 * <b>읽기 전용이다</b> — 원장을 손으로 고칠 수 있게 만들면 그 순간 장부가 아니게 된다.
 * 잘못 적힌 건은 PortOne 콘솔에서 확인하고 결제 상태를 바로잡는 경로로 처리한다.
 *
 * <p>페이지 파라미터를 반드시 서버로 넘긴다 — 관리자 탭 세 곳이 전부 "프론트에서 전량 받아
 * 필터링"으로 시작했다가 같은 문제를 겪었다(CLAUDE.md 함정 참고).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/refunds")
public class RefundLedgerAdminController {

    private static final int MAX_PAGE_SIZE = 100;

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
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE));

        Page<RefundAttempt> attempts = unresolvedOnly
                ? refundAttemptRepository.findByStatusInOrderByCreatedAtDesc(RefundAttempt.UNRESOLVED, pageable)
                : refundAttemptRepository.findAllByOrderByCreatedAtDesc(pageable);

        return ApiResponse.success(attempts.map(RefundAttemptResponse::from), "조회 성공");
    }

    /** 미결 건수만. 대시보드 타일용 — <b>0 이 정상</b>이다. */
    @GetMapping("/unresolved-count")
    public ApiResponse<Long> unresolvedCount() {
        return ApiResponse.success(
                refundAttemptRepository.countByStatusIn(RefundAttempt.UNRESOLVED), "조회 성공");
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
        return ApiResponse.success(history, "조회 성공");
    }
}
