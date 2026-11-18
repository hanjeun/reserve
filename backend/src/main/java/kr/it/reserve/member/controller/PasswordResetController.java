package kr.it.reserve.member.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.PasswordResetService;
import kr.it.reserve.member.dto.PasswordResetRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/password-reset")
public class PasswordResetController {

    private final PasswordResetService passwordResetService;
    private final RateLimiter rateLimiter;
    private final TaskExecutor resetExecutor;

    public PasswordResetController(PasswordResetService passwordResetService, RateLimiter rateLimiter,
                                   @Qualifier("passwordResetExecutor") TaskExecutor resetExecutor) {
        this.passwordResetService = passwordResetService;
        this.rateLimiter = rateLimiter;
        this.resetExecutor = resetExecutor;
    }

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

        String email = normalizeEmail(body.get("email"));
        if (email.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("이메일을 입력해주세요."));
        }
        if (!rateLimiter.tryConsume("password-reset:email:" + email, RateLimiter.Policy.EMAIL_SEND)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("요청이 너무 많아요. 잠시 후 다시 시도해주세요."));
        }

        // 회원 조회와 코드 생성 시간은 공개 응답에 포함하지 않는다.
        try {
            resetExecutor.execute(() -> {
                try {
                    passwordResetService.sendResetCode(email);
                } catch (RuntimeException failure) {
                    log.warn("Password reset request processing failed: errorType={}", failure.getClass().getSimpleName());
                }
            });
        } catch (TaskRejectedException rejected) {
            log.warn("Password reset request queue is full");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.error("요청이 많아요. 잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(null,
                "요청을 받았어요. 이메일 로그인이 설정된 주소라면 인증 코드를 보내요."));
    }

    public record VerifiedCode(Instant expiresAt) { }

    /** 코드 검증 */
    @PostMapping("/verify-code")
    public ResponseEntity<ApiResponse<VerifiedCode>> verifyCode(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String email = normalizeEmail(body.get("email"));
        String code  = body.get("code");

        ResponseEntity<ApiResponse<VerifiedCode>> throttled = throttleCodeAttempt(email, request);
        if (throttled != null) {
            return throttled;
        }

        Instant expiresAt = passwordResetService.verifyCode(email, code);
        return ResponseEntity.ok(ApiResponse.success(new VerifiedCode(expiresAt), "인증이 완료됐어요."));
    }

    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody PasswordResetRequest body,
            HttpServletRequest request) {

        String email       = normalizeEmail(body.getEmail());
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

    @ExceptionHandler(PasswordResetService.InvalidCode.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> invalidCode(PasswordResetService.InvalidCode failure) {
        return ResponseEntity.badRequest().body(ApiResponse.error(failure.getMessage(), Map.of("code", "PASSWORD_RESET_CODE_INVALID")));
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    /** IP·정규화된 계정별로 대조 횟수를 제한한다. 이메일이 없을 때는 IP만 제한하고 서비스 검증에 맡긴다. */
    private <T> ResponseEntity<ApiResponse<T>> throttleCodeAttempt(String email, HttpServletRequest request) {
        String ip = IpExtractor.extract(request);
        boolean ipQuotaLeft = rateLimiter.tryConsume(ip, RateLimiter.Policy.CODE_VERIFY);

        boolean accountQuotaLeft = true;
        if (ipQuotaLeft && !email.isEmpty()) {
            accountQuotaLeft = rateLimiter.tryConsume(email, RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
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
