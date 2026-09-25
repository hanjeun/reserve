package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.dto.AdPaymentAttemptResponse;
import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.advertisement.service.AdPaymentService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.config.util.SecurityUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** 관리자 전용 광고 금융 큐. 원장 조회는 PG 호출이나 상태 전이를 하지 않는다. */
@RestController
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@RequestMapping("/api/admin/ad-payments")
public class AdPaymentAdminController {
    private final AdPaymentAttemptRepository attempts;
    private final AdPaymentService payments;

    @GetMapping
    public ApiResponse<Page<AdPaymentAttemptResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "true") boolean openOnly) {
        return ApiResponse.success(attempts.findOperations(openOnly, PageRequests.bounded(page, size))
                .map(AdPaymentAttemptResponse::from), "조회 성공");
    }

    /** 이미 승인·저장된 취소 의도가 있으면 첫 환불 발신도 진행할 수 있는 쓰기 작업이다. */
    @PostMapping("/{id}/reconcile")
    public ApiResponse<AdPaymentAttemptResponse> reconcile(@PathVariable Long id) {
        String uid = attempts.findById(id).orElseThrow(AdvertisementException::notFound).getMerchantUid();
        payments.reconcile(uid, null);
        return result(id);
    }

    @PostMapping("/{id}/refund")
    public ApiResponse<AdPaymentAttemptResponse> refund(@PathVariable Long id) {
        var admin = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        payments.requestReviewedRefund(id, admin.getId());
        return result(id);
    }

    private ApiResponse<AdPaymentAttemptResponse> result(Long id) {
        return ApiResponse.success(AdPaymentAttemptResponse.from(attempts.findById(id)
                .orElseThrow(AdvertisementException::notFound)), "처리 후 상태를 확인해주세요.");
    }
}
