package kr.it.reserve.payment.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.payment.dto.PaymentCheckoutReturnResponse;
import kr.it.reserve.payment.service.PaymentCheckoutReturnService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PaymentCheckoutReturnController {
    private final PaymentCheckoutReturnService returns;
    private final RateLimiter limiter;

    public record Request(@NotBlank(message = "주문번호가 필요해요.")
                          @Size(max = 255, message = "주문번호가 너무 길어요.") String merchantUid) {}

    @PostMapping("/api/payment/checkout-return")
    public ResponseEntity<ApiResponse<PaymentCheckoutReturnResponse>> check(@Valid @RequestBody Request request) {
        Long memberId = SecurityUtil.getCurrentMember("결제 확인을 위해 로그인이 필요해요.").getId();
        if (!limiter.tryConsume("member:" + memberId, RateLimiter.Policy.PAYMENT_VERIFY)) {
            throw new PaymentException("결제 확인 요청이 많아요. 잠시 후 다시 확인해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                returns.check(request.merchantUid(), memberId), "결제창 복귀 상태를 확인했어요."));
    }
}
