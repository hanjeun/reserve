package kr.it.reserve.payment.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.payment.dto.PaymentStatusResponse;
import kr.it.reserve.payment.service.PaymentStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/payment/status")
public class PaymentStatusController {
    private final PaymentStatusService paymentStatusService;

    @GetMapping
    public ResponseEntity<ApiResponse<PaymentStatusResponse>> getStatus(
            @RequestParam(defaultValue = "reservation") String type, @RequestParam String merchantUid) {
        Long memberId = SecurityUtil.getCurrentMember("결제 확인을 위해 로그인이 필요해요.").getId();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                paymentStatusService.getStatus(type, merchantUid, memberId), "결제 상태 조회 성공"));
    }

    @GetMapping("/reservations/{reservationId}")
    public ResponseEntity<ApiResponse<PaymentStatusResponse>> getReservationStatus(@PathVariable Long reservationId) {
        Long memberId = SecurityUtil.getCurrentMember("결제 확인을 위해 로그인이 필요해요.").getId();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                paymentStatusService.getReservationStatus(reservationId, memberId), "결제 상태 조회 성공"));
    }
}
