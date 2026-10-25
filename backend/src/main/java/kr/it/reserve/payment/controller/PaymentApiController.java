package kr.it.reserve.payment.controller;

import kr.it.reserve.config.SiteUrls;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentVerificationService;
import kr.it.reserve.payment.service.PortoneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Import;
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
@Import(SiteUrls.class)
public class PaymentApiController {

    private static final String FAILED_REDIRECT_QUERY = "?success=false&merchant_uid=";
    private static final String ERROR_MESSAGE_QUERY = "&error_msg=";

    private final PaymentService paymentService;
    private final PaymentVerificationService paymentVerificationService;
    private final PortoneService portoneService;
    private final PaymentRepository paymentRepository;

    @Value("#{siteUrls.frontendOrigin}")
    private String frontendUrl;

    /**
     * PortOne V2의 paymentId·code·message 콜백을 받아 결과 페이지로 302 이동한다.
     * code가 없어도 결제 성공 증거로 삼지 않고 서버 검증을 통과한 경우에만 성공으로 안내한다.
     * paymentId는 prepare에서 발급한 merchantUid이며 결과 화면의 기존 쿼리 이름을 유지한다.
     * RestController이므로 redirect 문자열 대신 ResponseEntity의 Location을 사용한다.
     */
    @GetMapping("/mobile-redirect")
    public ResponseEntity<Void> handleMobileRedirect(
            @RequestParam(value = "paymentId", required = false) String paymentId,
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "message", required = false) String message) {

        log.info("Mobile payment redirect received: hasPaymentId={}, hasErrorCode={}",
                paymentId != null && !paymentId.isBlank(), code != null && !code.isBlank());
        boolean isSuccess = (code == null || code.isBlank());
        String redirectBase = frontendUrl + "/payment/result";
        // 프론트 결과 페이지는 merchant_uid 로 읽는다. 파라미터 이름은 그대로 두고 값만 V2 의 paymentId 를 싣는다.
        String merchantUid = paymentId;

        if (!isSuccess) {
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("결제 완료를 확인하지 못했어요. 내역을 확인해주세요."));
        }

        try {
            // 결제 정보를 조회하고 서버 검증을 진행합니다.
            Payment payment = paymentRepository.findByMerchantUid(merchantUid)
                    .orElseThrow(() -> new PaymentException("결제 정보를 찾을 수 없어요."));

            PaymentVerifyDto verifyDto = new PaymentVerifyDto();
            verifyDto.setMerchantUid(merchantUid);
            verifyDto.setReservationId(payment.getReservation().getId());

            paymentVerificationService.verifyRedirect(verifyDto);
            return redirect(redirectBase + "?success=true&merchant_uid=" + enc(merchantUid));
        } catch (BusinessException e) {
            // 외부 API 래퍼의 도메인 예외에도 원문이 섞일 수 있으므로 URL에 전달하지 않는다.
            log.warn("Mobile payment redirect failed: errorType={}", e.getClass().getSimpleName());
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("결제 완료를 확인하지 못했어요. 내역을 확인해주세요."));
        } catch (Exception e) {
            // 예상치 못한 예외의 메시지에는 내부 구조(클래스명·SQL·외부 API 응답)가 섞일 수 있다.
            // URL과 일반 로그에는 원문 대신 고정 문구·오류 종류만 남긴다.
            log.error("Mobile payment redirect error: errorType={}", e.getClass().getSimpleName());
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("결제 처리 중 오류가 발생했어요."));
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
        Long memberId = SecurityUtil.getCurrentMember("결제 준비를 위해 로그인이 필요해요.").getId();
        PaymentPrepareDto response = paymentService.preparePayment(requestDto, memberId);
        return ApiResponse.success(response, "결제 준비가 완료됐어요.");
    }

    /**
     * [기능] 결제 검증 (AJAX/Axios 전용)
     */
    @PostMapping("/verify")
    public ApiResponse<PaymentResponseDto> verifyPayment(@RequestBody PaymentVerifyDto verifyDto) {
        Member requester = SecurityUtil.getCurrentMember("인증되지 않은 사용자예요.");
        PaymentResponseDto response = paymentVerificationService.verifyByMember(verifyDto, requester);
        return ApiResponse.success(response, "결제 검증 및 처리가 완료됐어요.");
    }

    /** 예약 소유권을 확인하고 환불 금액은 서버 정책으로 계산한다. 본문의 금액·결제 ID는 신뢰하지 않는다. */
    @PostMapping("/refund")
    public ApiResponse<PaymentResponseDto> refundPayment(@RequestBody PaymentRefundDto refundDto) {
        Member requester = SecurityUtil.getCurrentMember("환불을 위해 로그인이 필요해요.");
        PaymentResponseDto response = paymentService.refundByMemberRequest(
                refundDto.getReservationId(), refundDto.getRefundReason(), requester);
        String message = Payment.PaymentStatus.REFUND_PENDING.name().equals(response.getStatus())
                ? "환불 요청을 확인하고 있어요. 처리 결과는 결제 내역에서 확인해주세요."
                : "환불 처리가 완료됐어요.";
        return ApiResponse.success(response, message);
    }

    /**
     * [기능] 내 결제 내역 조회
     */
    @GetMapping("/my-payments")
    public ApiResponse<List<PaymentResponseDto>> getMyPayments() {
        Long memberId = SecurityUtil.getCurrentMember("로그인이 필요해요.").getId();
        List<PaymentResponseDto> response = paymentService.getPaymentsByMember(memberId);
        return ApiResponse.success(response, "내 결제 내역 조회 성공");
    }

    /**
     * [기능] 환불 금액 미리보기
     */
    @GetMapping("/refund-preview/{reservationId}")
    public ApiResponse<Map<String, Object>> getRefundPreview(@PathVariable Long reservationId) {
        Member requester = SecurityUtil.getCurrentMember("조회 권한이 없어요.");
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
        // V2 의 storeId. 채널키는 공개 값이라 프론트 빌드 환경변수(VITE_PORTONE_CHANNEL_KEY)로 주입한다 —
        // 여기서 같이 내리면 결제창을 열 때마다 왕복이 하나 더 생기고, 값이 두 곳에 존재하게 된다.
        Map<String, String> config = Map.of("storeId", portoneService.getStoreId());
        return ApiResponse.success(config, "결제 설정 정보 조회 성공");
    }
}
