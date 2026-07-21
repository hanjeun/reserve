package kr.it.reserve.member.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.PasswordResetService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService passwordResetService;
    private final RateLimiter rateLimiter;

    /** 코드 발송 */
    @PostMapping("/send-code")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendCode(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.EMAIL_SEND)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }

        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("이메일을 입력해주세요."));
        }

        boolean sent = passwordResetService.sendResetCode(email);
        // sent=false: 미가입 or OAuth 계정 → 프론트에서 분기
        return ResponseEntity.ok(
                ApiResponse.success(Map.of("sent", sent), null)
        );
    }

    /** 코드 검증 */
    @PostMapping("/verify-code")
    public ResponseEntity<ApiResponse<Void>> verifyCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String code  = body.get("code");
        passwordResetService.verifyCode(email, code);
        return ResponseEntity.ok(ApiResponse.success(null, "인증이 완료되었습니다."));
    }

    /** 비밀번호 재설정 */
    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@RequestBody Map<String, String> body) {
        String email       = body.get("email");
        String code        = body.get("code");
        String newPassword = body.get("newPassword");
        passwordResetService.resetPassword(email, code, newPassword);
        return ResponseEntity.ok(ApiResponse.success(null, "비밀번호가 변경되었습니다."));
    }
}
