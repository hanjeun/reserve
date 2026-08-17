package kr.it.reserve.email.controller;

import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Locale;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
public class EmailApiController {

    private final EmailVerificationService verificationService;
    private final RateLimiter rateLimiter;

    /**
     * 인증 코드 발송
     */
    @PostMapping("/send-code")
    public ResponseEntity<Map<String, Object>> sendVerificationCode(@RequestBody Map<String, String> request,
                                                                    HttpServletRequest httpRequest) {
        String ip = IpExtractor.extract(httpRequest);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.EMAIL_SEND)) {
            throw new EmailException("이메일 발송 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        String email = request.get("email");

        if (email == null || email.isBlank()) {
            throw new EmailException("이메일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 이메일 형식 검증 (정규식)
        if (!email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
            throw new EmailException("올바른 이메일 형식이 아닙니다.", HttpStatus.BAD_REQUEST);
        }

        verificationService.sendVerificationCode(email);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "인증 코드가 발송되었습니다. 이메일을 확인해주세요."
        ));
    }

    /**
     * 인증 코드 검증
     */
    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, Object>> verifyCode(@RequestBody Map<String, String> request,
                                                          HttpServletRequest httpRequest) {
        String email = request.get("email");
        String code = request.get("code");

        if (email == null || email.isBlank() || code == null || code.isBlank()) {
            throw new EmailException("이메일과 인증 코드를 모두 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 코드 대조 시도 제한 (2026-08-16) — IP·계정 두 축.
        // 코드가 6자리 숫자라 제한이 없으면 무차별 대입으로 남의 이메일 인증을 통과시킬 수 있었다.
        // 1차 방어는 EmailVerification.attemptCount(코드 한 장당 5회), 이건 재발송 반복까지 막는 2차다.
        // ⚠️ 계정 키는 소문자로 정규화한다 — 안 하면 대소문자만 바꿔 제한을 우회한다.
        String ip = IpExtractor.extract(httpRequest);
        boolean ipQuotaLeft = rateLimiter.tryConsume(ip, RateLimiter.Policy.CODE_VERIFY);
        boolean accountQuotaLeft = rateLimiter.tryConsume(
                email.trim().toLowerCase(Locale.ROOT), RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        if (!ipQuotaLeft || !accountQuotaLeft) {
            log.warn("Email verification attempt throttled: ipQuotaLeft={}, accountQuotaLeft={}",
                    ipQuotaLeft, accountQuotaLeft);
            throw new EmailException("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        // 내부 로직에서 검증 실패 시 EmailException을 던지도록 Service도 수정해야 함
        verificationService.verifyCode(email, code);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "이메일 인증이 완료되었습니다."
        ));
    }

    /**
     * 이메일 인증 상태 확인
     */
    @GetMapping("/check-verified")
    public ResponseEntity<Map<String, Object>> checkVerified(@RequestParam String email) {
        boolean verified = verificationService.isEmailVerified(email);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "verified", verified
        ));
    }
}