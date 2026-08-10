package kr.it.reserve.payment.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
     *
     * <p>★ 이 클래스는 {@code @RestController} 다. 예전에는 여기서 {@code "redirect:" + url} 문자열을
     * 반환했는데, 뷰 리졸버를 타지 않으므로 302 가 나가지 않고 그 문자열이 <b>응답 본문</b>으로 찍혔다.
     * 모바일 결제 후 브라우저에 {@code redirect:https://...} 가 그대로 보이고 이동하지 않던 원인이다.
     * 302 는 {@link ResponseEntity} 로 직접 만들어야 한다.
     */
    @GetMapping("/mobile-redirect")
    public ResponseEntity<Void> handleMobileRedirect(
            @RequestParam(value = "imp_uid", required = false) String impUid,
            @RequestParam(value = "merchant_uid", required = false) String merchantUid,
            @RequestParam(value = "imp_success", required = false) String impSuccess,
            @RequestParam(value = "error_msg", required = false) String errorMsg) {

        log.info("Mobile payment redirect received: merchant_uid={}", merchantUid);
        boolean isSuccess = "true".equalsIgnoreCase(impSuccess);
        String redirectBase = frontendUrl + "/payment/result";

        if (!isSuccess) {
            return redirect(redirectBase + "?success=false&merchant_uid=" + enc(merchantUid) + "&error_msg=" + enc(errorMsg));
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
            return redirect(redirectBase + "?success=true&merchant_uid=" + enc(merchantUid));
        } catch (BusinessException e) {
            // 도메인 예외의 메시지는 애초에 사용자에게 보여줄 목적으로 쓴 한국어 문구라 그대로 전달한다.
            log.warn("Mobile payment redirect failed: merchant_uid={}, {}", merchantUid, e.getMessage());
            return redirect(redirectBase + "?success=false&merchant_uid=" + enc(merchantUid) + "&error_msg=" + enc(e.getMessage()));
        } catch (Exception e) {
            // 예상치 못한 예외의 메시지에는 내부 구조(클래스명·SQL·외부 API 응답)가 섞일 수 있다.
            // 브라우저 주소창에 그대로 실려 나가므로 고정 문구로 대체하고, 원인은 로그·Sentry에만 남긴다.
            log.error("Mobile payment redirect error: merchant_uid={}", merchantUid, e);
            return redirect(redirectBase + "?success=false&merchant_uid=" + enc(merchantUid)
                    + "&error_msg=" + enc("결제 처리 중 오류가 발생했습니다."));
        }
    }

    /**
     * 302 응답을 만든다. 목적지는 항상 우리 프론트엔드 URL 이고 쿼리 값은 {@link #enc} 로 인코딩된 뒤
     * 넘어오므로, 외부 입력이 Location 헤더의 호스트를 바꾸는 경로는 없다(오픈 리다이렉트 아님).
     */
    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .build();
    }

    /**
     * 리다이렉트 쿼리스트링에 실을 값을 URL 인코딩한다.
     * 여기서 만든 문자열은 그대로 Location 헤더가 되므로, 값에 &·#·%가 섞이면
     * 파라미터가 잘리거나 뒤에 임의 파라미터를 덧붙일 수 있다.
     */
    private static String enc(String value) {
        return value == null ? "" : URLEncoder.encode(value, StandardCharsets.UTF_8);
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
        Member requester = SecurityUtil.getCurrentMember("인증되지 않은 사용자입니다.");
        PaymentResponseDto response = paymentService.verifyAndCompletePaymentByMember(verifyDto, requester);
        return ApiResponse.success(response, "결제 검증 및 처리가 완료되었습니다.");
    }

    /**
     * [기능] 결제 환불 — <b>본인 예약만, 금액은 가게 정책으로 계산.</b>
     *
     * <p>★ 2026-08-09 수정 — 예전에는 이랬다.
     * <pre>
     * SecurityUtil.getCurrentMember("환불 권한이 없습니다.");   // 로그인 여부만 보고 결과를 버림
     * paymentService.refundPayment(refundDto);              // body 를 그대로 신뢰
     * </pre>
     * 그래서 로그인만 한 사람이 ① 남의 예약을 환불하거나 ② 환불 금액을 직접 정하거나
     * ③ "환불 불가" 정책을 건너뛰고 전액을 받을 수 있었다.
     * 이젠 {@code refundByMemberRequest} 가 소유자를 확인하고 금액을 정책에서 직접 계산한다.
     *
     * <p>요청 본문의 {@code refundAmount} · {@code paymentId} 는 <b>무시된다</b>.
     * 환불 대상은 {@code reservationId} 로만 정해진다.
     */
    @PostMapping("/refund")
    public ApiResponse<PaymentResponseDto> refundPayment(@RequestBody PaymentRefundDto refundDto) {
        Member requester = SecurityUtil.getCurrentMember("환불을 위해 로그인이 필요합니다.");
        PaymentResponseDto response = paymentService.refundByMemberRequest(
                refundDto.getReservationId(), refundDto.getRefundReason(), requester);
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
        Member requester = SecurityUtil.getCurrentMember("조회 권한이 없습니다.");
        PaymentService.RefundCalculationResult result =
                paymentService.calculateRefundAmountForMember(reservationId, requester);

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