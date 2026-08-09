package kr.it.reserve.member.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.PasswordResetService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
                    .body(ApiResponse.error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }

        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("이메일을 입력해주세요."));
        }

        // ★ 결과를 응답에 담지 않는다 (user enumeration 차단).
        //
        // 예전에는 {"sent": false} 를 200 으로 돌려주고 프론트가
        // "가입된 이메일이 아니거나 소셜 로그인 계정입니다" 를 띄웠다.
        // 프론트를 고쳐도 **이 API 를 직접 호출하면** 가입 여부가 그대로 드러나므로,
        // 노출을 막는 지점은 프론트가 아니라 여기여야 한다.
        //
        // 정석: 실제로 보냈는지와 무관하게 항상 같은 응답을 준다.
        // 미가입 이메일을 넣은 사용자는 코드 입력 화면으로 넘어가고 메일이 오지 않을 뿐이다
        // (GitHub·Google 등이 쓰는 방식). 안내 문구로 그 상황을 설명한다.
        //
        // 반환값을 버리는 게 아니라 로그로만 남긴다 — 운영자는 알아야 하고 공격자는 몰라야 한다.
        boolean sent = passwordResetService.sendResetCode(email);
        log.info("Password reset requested: sent={}", sent);

        return ResponseEntity.ok(ApiResponse.success(
                null, "입력하신 이메일로 인증 코드를 보냈습니다. 메일이 오지 않으면 가입 여부를 확인해주세요."));
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
