package com.reserve.payment.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.PaymentException;
import com.reserve.payment.dto.*;
import com.reserve.payment.entity.Payment;
import com.reserve.payment.repository.PaymentRepository;
import com.reserve.payment.service.PaymentService;
import com.reserve.payment.service.PortoneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/payment")
public class PaymentApiController {

    private final PaymentService paymentService;
    private final PortoneService portoneService;
    private final PaymentRepository paymentRepository;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * [기능] 모바일 결제 사후 처리 (Redirect)
     * 결제 성공/실패 여부에 따라 프론트엔드 결과 페이지로 리다이렉트합니다.
     */
    @GetMapping("/mobile-redirect")
    public String handleMobileRedirect(
            @RequestParam(value = "imp_uid", required = false) String impUid,
            @RequestParam(value = "merchant_uid", required = false) String merchantUid,
            @RequestParam(value = "imp_success", required = false) String impSuccess,
            @RequestParam(value = "error_msg", required = false) String errorMsg) {

        log.info("Mobile payment redirect received: merchant_uid={}", merchantUid);
        boolean isSuccess = "true".equalsIgnoreCase(impSuccess);
        String redirectBase = "redirect:" + frontendUrl + "/payment/result";

        if (!isSuccess) {
            return redirectBase + "?success=false&merchant_uid=" + merchantUid + "&error_msg=" + (errorMsg != null ? errorMsg : "");
        }

        try {
            // 결제 정보를 조회하고 서버 검증을 진행합니다.
            Payment payment = paymentRepository.findByMerchantUid(merchantUid)
                    .orElseThrow(() -> new PaymentException("결제 정보를 찾을 수 없습니다."));

            PaymentVerifyDto verifyDto = new PaymentVerifyDto();
            verifyDto.setImpUid(impUid);
            verifyDto.setMerchantUid(merchantUid);
            verifyDto.setReservationId(payment.getReservation().getId());

            paymentService.verifyAndCompletePayment(verifyDto);
            return redirectBase + "?success=true&merchant_uid=" + merchantUid;
        } catch (Exception e) {
            log.error("Mobile redirect processing error: {}", e.getMessage());
            return redirectBase + "?success=false&merchant_uid=" + merchantUid + "&error_msg=" + e.getMessage();
        }
    }

    /**
     * [기능] 결제 준비
     */
    @PostMapping("/prepare")
    public ApiResponse<PaymentPrepareDto> preparePayment(@RequestBody PaymentRequestDto requestDto) {
        Long memberId = SecurityUtil.getCurrentMember("결제 준비를 위해 로그인이 필요합니다.").getId();
        PaymentPrepareDto response = paymentService.preparePayment(requestDto, memberId);
        return ApiResponse.success(response, "결제 준비가 완료되었습니다.");
    }

    /**
     * [기능] 결제 검증 (AJAX/Axios 전용)
     */
    @PostMapping("/verify")
    public ApiResponse<PaymentResponseDto> verifyPayment(@RequestBody PaymentVerifyDto verifyDto) {
        SecurityUtil.getCurrentMember("인증되지 않은 사용자입니다.");
        PaymentResponseDto response = paymentService.verifyAndCompletePayment(verifyDto);
        return ApiResponse.success(response, "결제 검증 및 처리가 완료되었습니다.");
    }

    /**
     * [기능] 결제 환불
     */
    @PostMapping("/refund")
    public ApiResponse<PaymentResponseDto> refundPayment(@RequestBody PaymentRefundDto refundDto) {
        SecurityUtil.getCurrentMember("환불 권한이 없습니다.");
        PaymentResponseDto response = paymentService.refundPayment(refundDto);
        return ApiResponse.success(response, "환불 처리가 완료되었습니다.");
    }

    /**
     * [기능] 내 결제 내역 조회
     */
    @GetMapping("/my-payments")
    public ApiResponse<List<PaymentResponseDto>> getMyPayments() {
        Long memberId = SecurityUtil.getCurrentMember("로그인이 필요합니다.").getId();
        List<PaymentResponseDto> response = paymentService.getPaymentsByMember(memberId);
        return ApiResponse.success(response, "내 결제 내역 조회 성공");
    }

    /**
     * [기능] 환불 금액 미리보기
     */
    @GetMapping("/refund-preview/{reservationId}")
    public ApiResponse<Map<String, Object>> getRefundPreview(@PathVariable Long reservationId) {
        SecurityUtil.getCurrentMember("조회 권한이 없습니다.");
        PaymentService.RefundCalculationResult result = paymentService.calculateRefundAmount(reservationId);

        Map<String, Object> response = Map.of(
                "refundAmount", result.getRefundAmount(),
                "refundRate", result.getRefundRate(),
                "reason", result.getReason()
        );
        return ApiResponse.success(response, "환불 예상 금액 조회 성공");
    }

    /**
     * [기능] 포트원 설정 정보 조회
     */
    @GetMapping("/config")
    public ApiResponse<Map<String, String>> getPaymentConfig() {
        Map<String, String> config = Map.of("impCode", portoneService.getImpCode());
        return ApiResponse.success(config, "결제 설정 정보 조회 성공");
    }
}