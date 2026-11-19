package kr.it.reserve.member.mfa;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.SiteUrls;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.email.service.EmailDelivery;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Locale;

@RestController
@RequiredArgsConstructor
public class AccountProtectionController {
    private static final String MFA_COOKIE = "mfa_ticket";
    private static final String RECOVERY_COOKIE = "account_recovery";
    private final AccountProtectionService protection;
    private final MfaService mfa;
    private final MfaCrypto crypto;
    private final AccountRecoveryMailer recoveryMailer;
    private final CookieUtil cookies;
    private final RateLimiter limiter;
    private final EmailService email;
    private final SiteUrls sites;

    public record Action(boolean resend, @Size(max = 200) String reason) {
        @Override public String toString() { return "Action[redacted]"; }
    }
    public record RecoveryLink(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String key) {
        @Override public String toString() { return "RecoveryLink[redacted]"; }
    }
    public record RecoveryEmail(@NotBlank @Email @Size(max = 254) String email) {
        @Override public String toString() { return "RecoveryEmail[redacted]"; }
    }
    public record EmailCodeRequest(String reference, Instant expiresAt) {
        @Override public String toString() { return "EmailCodeRequest[redacted]"; }
    }
    public record EmailCodeProof(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String reference,
            @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
        @Override public String toString() { return "EmailCodeProof[redacted]"; }
    }
    public record Proof(@NotBlank @Pattern(regexp = "PASSKEY|TOTP|BACKUP") String kind, @NotBlank @Size(max = 65_536) String proof) {
        @Override public String toString() { return "Proof[redacted]"; }
    }
    public record Result(boolean notificationSubmitted) { }
    public record BackupCode(@NotBlank @Size(max = 128) String code) {
        @Override public String toString() { return "BackupCode[redacted]"; }
    }

    @ModelAttribute
    void noStore(HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/api/admin/manage/members/{id}/account-protection/confirm")
    public ApiResponse<MfaService.View> confirm(@PathVariable @Positive Long id, @Valid @RequestBody Action action,
            @AuthenticationPrincipal Member admin, HttpServletRequest request, HttpServletResponse response) {
        adminLimit(admin, request);
        String sid = SecurityUtil.getSessionId();
        var ticket = protection.begin(admin, sid, SecurityUtil.isPersistentLogin(), CookieUtil.getCookie(request, MFA_COOKIE), id, action.resend());
        cookies.addCookie(response, MFA_COOKIE, ticket.value(), ticket.persistent() ? 300 : -1);
        return ApiResponse.success(mfa.status(ticket.value(), admin, sid), "관리자 본인 확인을 시작했어요.");
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/api/admin/manage/members/{id}/account-protection")
    public ApiResponse<Result> protect(@PathVariable @Positive Long id, @Valid @RequestBody Action action,
            @AuthenticationPrincipal Member admin, HttpServletRequest request, HttpServletResponse response) {
        adminLimit(admin, request);
        var notice = protection.protect(admin, SecurityUtil.getSessionId(), CookieUtil.getCookie(request, MFA_COOKIE), id, action.reason(), action.resend());
        cookies.deleteCookie(response, MFA_COOKIE);
        return ApiResponse.success(new Result(deliver(notice)), "계정 보호 요청을 처리했어요.");
    }

    @PostMapping("/api/auth/account-recovery/start")
    public ApiResponse<MfaService.RecoveryMethods> start(@Valid @RequestBody RecoveryLink link, HttpServletRequest request, HttpServletResponse response) {
        recoveryLimit(request, false);
        return openRecovery(mfa.beginAccountRecovery(link.key()), response);
    }

    @PostMapping("/api/auth/account-recovery/email/send-code")
    public ApiResponse<EmailCodeRequest> requestCode(@Valid @RequestBody RecoveryEmail body, HttpServletRequest request) {
        if (!limiter.tryConsume("account-recovery-email-send-ip:" + IpExtractor.extract(request), RateLimiter.Policy.EMAIL_SEND)) throw limited();
        var challenge = new EmailCodeRequest(crypto.randomToken(), Instant.now().plusSeconds(MfaService.RECOVERY_EMAIL_TTL_SECONDS));
        // 주소 확인과 실제 발송 시간은 비로그인 응답의 근거로 사용하지 않는다.
        try {
            recoveryMailer.queueCode(body.email().strip().toLowerCase(Locale.ROOT), challenge.reference(), challenge.expiresAt());
        } catch (TaskRejectedException rejected) {
            throw new AuthException("요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        return ApiResponse.success(challenge, "요청을 받았어요. 잠긴 계정의 보안 이메일이면 인증 코드를 보내요.");
    }

    @PostMapping("/api/auth/account-recovery/email/verify-code")
    public ApiResponse<MfaService.RecoveryMethods> verifyCode(@Valid @RequestBody EmailCodeProof body, HttpServletRequest request,
            HttpServletResponse response) {
        recoveryLimit(request, true);
        return openRecovery(mfa.beginAccountRecoveryWithEmail(body.reference(), body.code()), response);
    }

    private ApiResponse<MfaService.RecoveryMethods> openRecovery(MfaService.Ticket ticket, HttpServletResponse response) {
        var methods = mfa.accountRecoveryMethods(ticket.value());
        cookies.addCookie(response, RECOVERY_COOKIE, ticket.value(), 300);
        return ApiResponse.success(methods, "계정 복구 본인 확인을 시작했어요.");
    }

    @PostMapping("/api/auth/account-recovery/passkey")
    public ApiResponse<String> passkey(HttpServletRequest request) {
        recoveryLimit(request, false);
        return ApiResponse.success(mfa.accountRecoveryOptions(CookieUtil.getCookie(request, RECOVERY_COOKIE)), "패스키로 확인해주세요.");
    }

    @PostMapping("/api/auth/account-recovery/backup")
    public ApiResponse<BackupCode> prepareBackup(@Valid @RequestBody BackupCode body, HttpServletRequest request) {
        recoveryLimit(request, true);
        String replacement = mfa.prepareRecoveryBackup(CookieUtil.getCookie(request, RECOVERY_COOKIE), body.code());
        return ApiResponse.success(new BackupCode(replacement), "새 복구코드를 보관해주세요.");
    }

    @PostMapping("/api/auth/account-recovery/complete")
    public ApiResponse<Result> complete(@Valid @RequestBody Proof body, HttpServletRequest request, HttpServletResponse response) {
        recoveryLimit(request, true);
        var notice = protection.recover(CookieUtil.getCookie(request, RECOVERY_COOKIE), body.kind(), body.proof());
        cookies.deleteCookie(response, RECOVERY_COOKIE);
        return ApiResponse.success(new Result(deliver(notice)), "계정 복구를 완료했어요.");
    }

    private boolean deliver(AccountProtectionService.Notice notice) {
        String link = notice.linkKey() == null ? null : sites.frontendPath("/account-recovery#key=" + notice.linkKey());
        try {
            EmailDelivery.await(EmailDelivery.submit(() -> email.sendAccountProtectionEmail(notice.recipient(), link)));
            return true;
        } catch (EmailException unavailable) {
            return false;
        }
    }

    private void adminLimit(Member admin, HttpServletRequest request) {
        if (!limiter.tryConsume("account-protection-ip:" + IpExtractor.extract(request), RateLimiter.Policy.LOGIN_METHOD_VERIFY)
                || !limiter.tryConsume("account-protection-admin:" + admin.getId(), RateLimiter.Policy.LOGIN_METHOD_VERIFY))
            throw limited();
    }

    private void recoveryLimit(HttpServletRequest request, boolean proof) {
        if (!limiter.tryConsume("account-recovery-ip:" + IpExtractor.extract(request),
                proof ? RateLimiter.Policy.CODE_VERIFY : RateLimiter.Policy.LOGIN_METHOD_VERIFY)) throw limited();
    }

    private static AuthException limited() {
        return new AuthException("보안 확인 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
    }
}
