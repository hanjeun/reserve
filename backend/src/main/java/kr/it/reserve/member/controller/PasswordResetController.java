package kr.it.reserve.member.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.PasswordResetService;
import kr.it.reserve.member.dto.PasswordResetRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Locale;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService passwordResetService;
    private final RateLimiter rateLimiter;

    /** 코드 발송 */
    @PostMapping("/send-code")
    public ResponseEntity<ApiResponse<Void>> sendCode(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.EMAIL_SEND)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("요청이 너무 많아요. 잠시 후 다시 시도해주세요."));
        }

        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("이메일을 입력해주세요."));
        }

        // 가입 여부·메일 발송 여부는 응답으로 구분하지 않는다. 발송 큐 등록과 실제 발송 성공은 별개다.
        boolean queued = passwordResetService.sendResetCode(email);
        log.info("Password reset queued (not yet delivered): queued={}", queued);

        return ResponseEntity.ok(ApiResponse.success(
                null, "입력하신 이메일로 인증 코드를 보냈어요. 메일이 오지 않으면 가입 여부를 확인해주세요."));
    }

    /** 코드 검증 */
    @PostMapping("/verify-code")
    public ResponseEntity<ApiResponse<Void>> verifyCode(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String email = body.get("email");
        String code  = body.get("code");

        ResponseEntity<ApiResponse<Void>> throttled = throttleCodeAttempt(email, request);
        if (throttled != null) {
            return throttled;
        }

        passwordResetService.verifyCode(email, code);
        return ResponseEntity.ok(ApiResponse.success(null, "인증이 완료됐어요."));
    }

    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody PasswordResetRequest body,
            HttpServletRequest request) {

        String email       = body.getEmail();
        String code        = body.getCode();
        String newPassword = body.getNewPassword();

        // verify-code 뿐 아니라 여기도 막는다. 이 엔드포인트도 코드를 대조하므로
        //   verify-code 를 건너뛰고 여기만 두드리는 우회가 가능하다(서비스 주석 참고).
        ResponseEntity<ApiResponse<Void>> throttled = throttleCodeAttempt(email, request);
        if (throttled != null) {
            return throttled;
        }

        passwordResetService.resetPassword(email, code, newPassword);
        return ResponseEntity.ok(ApiResponse.success(null, "비밀번호가 변경됐어요."));
    }

    /** IP·정규화된 계정별로 대조 횟수를 제한한다. 이메일이 없을 때는 IP만 제한하고 서비스 검증에 맡긴다. */
    private ResponseEntity<ApiResponse<Void>> throttleCodeAttempt(String email, HttpServletRequest request) {
        String ip = IpExtractor.extract(request);
        boolean ipQuotaLeft = rateLimiter.tryConsume(ip, RateLimiter.Policy.CODE_VERIFY);

        boolean accountQuotaLeft = true;
        if (email != null && !email.isBlank()) {
            accountQuotaLeft = rateLimiter.tryConsume(
                    email.trim().toLowerCase(Locale.ROOT), RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        }

        if (!ipQuotaLeft || !accountQuotaLeft) {
            log.warn("Password reset code attempt throttled: ipQuotaLeft={}, accountQuotaLeft={}",
                    ipQuotaLeft, accountQuotaLeft);
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("요청이 너무 많아요. 잠시 후 다시 시도해주세요."));
        }
        return null;
    }
}
