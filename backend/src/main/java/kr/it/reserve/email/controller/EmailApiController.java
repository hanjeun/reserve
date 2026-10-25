package kr.it.reserve.email.controller;

import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
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

    /** 잠금 충돌이 이 경계에 도달하면 서비스 트랜잭션은 이미 롤백된 상태다. */
    @ExceptionHandler(PessimisticLockingFailureException.class)
    ResponseEntity<ApiResponse<Void>> concurrentVerification(PessimisticLockingFailureException failure) {
        log.warn("Email verification lock conflict: errorType={}", failure.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "1")
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.error("인증 요청을 처리 중이에요. 잠시 후 다시 시도해주세요."));
    }

    /**
     * 인증 코드 발송
     */
    @PostMapping("/send-code")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendVerificationCode(@RequestBody Map<String, String> request,
                                                                    HttpServletRequest httpRequest) {
        String ip = IpExtractor.extract(httpRequest);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.EMAIL_SEND)) {
            throw new EmailException("이메일 발송 요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        String email = request.get("email");

        if (email == null || email.isBlank()) {
            throw new EmailException("이메일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 이메일 형식 검증 (정규식)
        if (!email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
            throw new EmailException("올바른 이메일 형식이 아니에요.", HttpStatus.BAD_REQUEST);
        }

        var expiresAt = verificationService.sendVerificationCode(email);

        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                Map.of("expiresAt", expiresAt), "인증 코드가 발송됐어요. 이메일을 확인해주세요."));
    }

    /**
     * 인증 코드 검증
     */
    @PostMapping("/verify-code")
    public ResponseEntity<ApiResponse<EmailVerificationService.VerificationResult>> verifyCode(@RequestBody Map<String, String> request,
                                                          HttpServletRequest httpRequest) {
        String email = request.get("email");
        String code = request.get("code");

        if (email == null || email.isBlank() || code == null || code.isBlank()) {
            throw new EmailException("이메일과 인증 코드를 모두 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 코드별 시도 제한에 더해 IP·계정별 재발송과 대조를 제한한다. 이메일은 소문자로 정규화해 우회를 막는다.
        String ip = IpExtractor.extract(httpRequest);
        boolean ipQuotaLeft = rateLimiter.tryConsume(ip, RateLimiter.Policy.CODE_VERIFY);
        boolean accountQuotaLeft = rateLimiter.tryConsume(
                email.trim().toLowerCase(Locale.ROOT), RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        if (!ipQuotaLeft || !accountQuotaLeft) {
            log.warn("Email verification attempt throttled: ipQuotaLeft={}, accountQuotaLeft={}",
                    ipQuotaLeft, accountQuotaLeft);
            throw new EmailException("요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        var verified = verificationService.verifyCodeAndIssueTicket(email, code);

        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                verified, "이메일 인증이 완료됐어요."));
    }

}
