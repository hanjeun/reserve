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
        // ★ 이 값은 "메일이 도착했다"가 아니라 "발송을 큐에 넣었다"는 뜻이다.
        //    sendResetCode 는 @Async 인 emailService.sendPasswordResetEmail 을 부르고 바로 반환한다.
        //    예전 문구가 `sent={}` 라서, 2026-08 메일 장애 때 이 로그만 보고 "정상 발송"으로
        //    오해했다(실제로는 2초 뒤 다른 스레드에서 SMTP 인증이 실패하고 있었다).
        //    실제 발송 성공은 EmailService 의 "Password reset email sent" 로그로만 확인할 수 있다.
        boolean queued = passwordResetService.sendResetCode(email);
        log.info("Password reset queued (not yet delivered): queued={}", queued);

        return ResponseEntity.ok(ApiResponse.success(
                null, "입력하신 이메일로 인증 코드를 보냈습니다. 메일이 오지 않으면 가입 여부를 확인해주세요."));
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
        return ResponseEntity.ok(ApiResponse.success(null, "인증이 완료되었습니다."));
    }

    /** 비밀번호 재설정 */
    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String email       = body.get("email");
        String code        = body.get("code");
        String newPassword = body.get("newPassword");

        // ★ verify-code 뿐 아니라 여기도 막는다. 이 엔드포인트도 코드를 대조하므로
        //   verify-code 를 건너뛰고 여기만 두드리는 우회가 가능하다(서비스 주석 참고).
        ResponseEntity<ApiResponse<Void>> throttled = throttleCodeAttempt(email, request);
        if (throttled != null) {
            return throttled;
        }

        passwordResetService.resetPassword(email, code, newPassword);
        return ResponseEntity.ok(ApiResponse.success(null, "비밀번호가 변경되었습니다."));
    }

    /**
     * 코드 대조 시도에 IP·계정 두 축의 상한을 건다. 통과하면 {@code null}, 막히면 429 응답.
     *
     * <h3>왜 두 축인가</h3>
     * IP 축만 두면 프록시·봇넷으로 IP 를 돌려 무제한이 되고, 계정 축만 두면 회사·학교
     * NAT 뒤의 정상 사용자들이 한 사람 때문에 함께 막힌다. 로그인에서 이미 쓰는 구조다
     * ({@code LOGIN} + {@code LOGIN_ACCOUNT}).
     *
     * <p>⚠️ 계정 키는 <b>소문자로 정규화</b>해서 넘긴다. 안 하면 {@code A@x.com} 과
     * {@code a@x.com} 이 다른 버킷이 되어 제한이 통째로 무의미해진다.
     *
     * <p>이메일이 비어 있으면 IP 축만 건다 — 검증은 서비스가 하고, 여기서 400 을 대신
     * 돌려주면 응답 형태가 갈라진다.
     */
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
                    .body(ApiResponse.error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }
        return null;
    }
}
