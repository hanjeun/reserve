package kr.it.reserve.member.mfa;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class MfaController {
    private final MfaService mfa;
    private final CookieUtil cookies;
    private final JwtProperties jwt;
    private final RateLimiter limiter;
    public record Login(Boolean rememberMe) { }
    public record Manage(@Size(max = 64) String password) {
        @Override public String toString() { return "Manage[redacted]"; }
    }
    public record Code(@NotBlank @Size(max = 6) String code) {
        @Override public String toString() { return "Code[redacted]"; }
    }
    public record Options(boolean registration) { }
    public record Registration(@NotBlank @Size(max = 65_536) String credential, @Size(max = 80) String name) {
        @Override public String toString() { return "Registration[redacted]"; }
    }
    public record Proof(@NotBlank @Pattern(regexp = "TOTP|PASSKEY|BACKUP") String kind, @NotBlank @Size(max = 65_536) String proof) {
        @Override public String toString() { return "Proof[redacted]"; }
    }
    public record Removal(@NotBlank @Size(max = 36) String id) { }
    public record Recovery(java.util.List<String> codes) {
        @Override public String toString() { return "Recovery[redacted]"; }
    }
    @ModelAttribute
    void noStore(HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }

    @GetMapping("/api/member/mfa")
    public ApiResponse<MfaService.Settings> settings(@AuthenticationPrincipal Member member) {
        return ok(mfa.settings(member));
    }
    @PostMapping("/api/member/mfa/manage")
    public ApiResponse<MfaService.View> manage(@AuthenticationPrincipal Member member, @Valid @RequestBody Manage body,
            HttpServletRequest request, HttpServletResponse response) {
        limit(request);
        var ticket = mfa.beginManage(member, SecurityUtil.getSessionId(), SecurityUtil.getOAuthAuthenticationAt(), body.password(), SecurityUtil.isPersistentLogin());
        cookies.addCookie(response, "mfa_ticket", ticket.value(), ticket.persistent() ? 300 : -1);
        return ok(mfa.status(ticket.value(), member, SecurityUtil.getSessionId()));
    }
    @PostMapping("/api/auth/mfa/status")
    public ApiResponse<MfaService.View> status(HttpServletRequest request, @AuthenticationPrincipal Member member) {
        limit(request);
        return ok(mfa.status(ticket(request), member, SecurityUtil.getSessionId()));
    }
    @PostMapping("/api/auth/mfa/passkey/login")
    public ApiResponse<MfaService.View> passkeyLogin(HttpServletRequest request, HttpServletResponse response, @RequestBody(required = false) Login body) {
        limit(request);
        mfa.cancel(ticket(request));
        var ticket = mfa.beginPasskeyLogin(body != null && Boolean.TRUE.equals(body.rememberMe()));
        cookies.deleteCookie(response, "access_token");
        cookies.deleteCookie(response, "refresh_token");
        cookies.addCookie(response, "mfa_ticket", ticket.value(), ticket.persistent() ? 300 : -1);
        return ok(mfa.status(ticket.value(), null, null));
    }
    @PostMapping("/api/auth/mfa/totp/setup")
    public ApiResponse<MfaService.TotpSetup> setup(HttpServletRequest request, @AuthenticationPrincipal Member member) {
        limit(request);
        return ok(mfa.beginTotp(ticket(request), member, SecurityUtil.getSessionId()));
    }
    @PostMapping("/api/auth/mfa/totp/confirm")
    public ApiResponse<Recovery> confirmTotp(HttpServletRequest request, @AuthenticationPrincipal Member member, @Valid @RequestBody Code body) {
        limit(request);
        return ok(new Recovery(mfa.confirmTotp(ticket(request), member, SecurityUtil.getSessionId(), body.code())));
    }
    @PostMapping("/api/auth/mfa/passkey/options")
    public ApiResponse<String> options(HttpServletRequest request, @AuthenticationPrincipal Member member, @RequestBody Options body) {
        limit(request);
        return ok(mfa.beginPasskey(ticket(request), member, SecurityUtil.getSessionId(), body.registration()));
    }
    @PostMapping("/api/auth/mfa/passkey/confirm")
    public ApiResponse<Recovery> confirmPasskey(HttpServletRequest request, @AuthenticationPrincipal Member member, @Valid @RequestBody Registration body) {
        limit(request);
        return ok(new Recovery(mfa.confirmPasskey(ticket(request), member, SecurityUtil.getSessionId(), body.credential(), body.name())));
    }
    @PostMapping("/api/auth/mfa/verify")
    public ApiResponse<MfaService.View> verify(HttpServletRequest request, @AuthenticationPrincipal Member member, @Valid @RequestBody Proof body) {
        limit(request);
        return ok(mfa.verify(ticket(request), member, SecurityUtil.getSessionId(), body.kind(), body.proof()));
    }
    @PostMapping("/api/auth/mfa/finish")
    public ApiResponse<Void> finish(HttpServletRequest request, HttpServletResponse response, @AuthenticationPrincipal Member member) {
        limit(request);
        var result = mfa.finish(ticket(request), member, SecurityUtil.getSessionId());
        if (result.session() != null) {
            cookies.addAuthCookies(response, result.session().accessToken(), result.session().refreshToken(),
                    (int) jwt.getAccessTokenExpiration().toSeconds(), (int) result.session().refreshMaxAge().toSeconds(), result.session().persistent());
        }
        cookies.deleteCookie(response, "mfa_ticket");
        return ok(null);
    }
    @PostMapping("/api/auth/mfa/defer")
    public ApiResponse<Void> defer(HttpServletRequest request, HttpServletResponse response, @AuthenticationPrincipal Member member) {
        limit(request);
        var result = mfa.deferEnrollment(ticket(request), member, SecurityUtil.getSessionId());
        cookies.addAuthCookies(response, result.session().accessToken(), result.session().refreshToken(),
                (int) jwt.getAccessTokenExpiration().toSeconds(), (int) result.session().refreshMaxAge().toSeconds(), result.session().persistent());
        cookies.deleteCookie(response, "mfa_ticket");
        return ok(null);
    }
    @PostMapping("/api/auth/mfa/cancel")
    public ApiResponse<Void> cancel(HttpServletRequest request, HttpServletResponse response) {
        limit(request);
        mfa.cancel(ticket(request));
        cookies.deleteCookie(response, "mfa_ticket");
        return ok(null);
    }
    @PostMapping("/api/auth/mfa/recovery")
    public ApiResponse<Recovery> recovery(HttpServletRequest request, @AuthenticationPrincipal Member member) {
        limit(request);
        return ok(new Recovery(mfa.regenerateRecovery(ticket(request), member, SecurityUtil.getSessionId())));
    }
    @PostMapping("/api/auth/mfa/remove")
    public ApiResponse<Void> remove(HttpServletRequest request, HttpServletResponse response, @AuthenticationPrincipal Member member, @Valid @RequestBody Removal body) {
        limit(request);
        mfa.remove(ticket(request), member, SecurityUtil.getSessionId(), body.id());
        cookies.deleteCookie(response, "mfa_ticket");
        return ok(null);
    }
    @PostMapping("/api/auth/mfa/disable")
    public ApiResponse<Void> disable(HttpServletRequest request, HttpServletResponse response, @AuthenticationPrincipal Member member) {
        limit(request);
        mfa.disable(ticket(request), member, SecurityUtil.getSessionId());
        cookies.deleteCookie(response, "mfa_ticket");
        return ok(null);
    }
    private static <T> ApiResponse<T> ok(T value) { return ApiResponse.success(value, "요청을 처리했어요."); }
    private String ticket(HttpServletRequest request) { return CookieUtil.getCookie(request, "mfa_ticket"); }
    private void limit(HttpServletRequest request) {
        if (!limiter.tryConsume("mfa:" + IpExtractor.extract(request), RateLimiter.Policy.CODE_VERIFY))
            throw new AuthException("인증 시도가 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
    }
}
