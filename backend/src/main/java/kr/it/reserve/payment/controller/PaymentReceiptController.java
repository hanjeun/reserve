package kr.it.reserve.payment.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.support.PaymentReceiptRequests;
import kr.it.reserve.member.mfa.MfaPolicy;
import kr.it.reserve.payment.dto.PaymentReceiptResponse;
import kr.it.reserve.payment.service.PaymentReceiptService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PaymentReceiptController {
    private final PaymentReceiptService receipts;
    private final PaymentReceiptRequests requests;
    private final RateLimiter limiter;
    private final ApplicationEventPublisher events;

    public record ReceiptRequest(
            @NotBlank @Pattern(regexp = "reservation|ad", message = "결제 유형을 확인해주세요.") String type,
            @NotBlank(message = "주문번호가 필요해요.") @Size(max = 255, message = "주문번호가 너무 길어요.") String merchantUid,
            @NotNull(message = "문의 번호가 필요해요.") @Positive(message = "문의 번호를 확인해주세요.") Long inquiryId) {}

    @GetMapping("/api/payment/receipt")
    public ResponseEntity<ApiResponse<PaymentReceiptResponse>> mine(
            @RequestParam(defaultValue = "reservation") String type, @RequestParam String merchantUid) {
        long memberId = SecurityUtil.getCurrentMemberId();
        limit("member:" + memberId);
        return noStore(receipts.lookup(type, merchantUid, memberId));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/api/admin/payment-operations/receipts/lookup")
    public ResponseEntity<ApiResponse<PaymentReceiptResponse>> lookup(@Valid @RequestBody ReceiptRequest request) {
        if (!MfaPolicy.strong(SecurityUtil.getLoginMethod())) {
            throw new PaymentException("추가 인증을 마친 관리자만 영수증을 조회할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        long adminId = SecurityUtil.getCurrentMemberId();
        limit("admin:" + adminId);
        String order = request.merchantUid().strip();
        long requesterId = requests.requesterFor(request.inquiryId(), order).orElseThrow(PaymentException::notFound);
        return noStore(receipts.lookup(request.type(), order, requesterId, id ->
                events.publishEvent(new PaymentReceiptService.AdminLookup(id, request.type(), request.inquiryId(), adminId))));
    }

    private void limit(String key) {
        if (!limiter.tryConsume(key, RateLimiter.Policy.PAYMENT_RECEIPT)) {
            throw new PaymentException("영수증 조회 요청이 많아요. 잠시 후 다시 확인해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private ResponseEntity<ApiResponse<PaymentReceiptResponse>> noStore(PaymentReceiptResponse receipt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(receipt, "영수증 조회 완료"));
    }
}
