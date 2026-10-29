package kr.it.reserve.config.controller;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.error.MemberSuspendedException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.dto.MemberResponse;
import kr.it.reserve.member.dto.MemberSignupRequest;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.service.MemberService;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.Locale;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/auth")
public class AuthApiController {
    private static final String REFRESH_TOKEN_COOKIE = "refresh_token";

    private final MemberService memberService;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtProperties jwtProperties;
    private final TokenService tokenService;
    private final RateLimiter rateLimiter;
    private final CookieUtil cookieUtil;
    @org.springframework.beans.factory.annotation.Autowired
    private kr.it.reserve.member.service.LoginMethodService loginMethods;
    @org.springframework.beans.factory.annotation.Autowired private kr.it.reserve.member.mfa.MfaService mfa;
    private static final String ACCESS_TOKEN_COOKIE = "access_token";

    /**
     * 로그인 실패 시 내보내는 <b>유일한</b> 문구. 미가입·소셜계정·비번불일치를 구분하지 않는다.
     * 문구를 나누면 그 자체가 계정 존재 여부를 알려주는 신호가 된다.
     */
    private static final String LOGIN_FAILED_MESSAGE = "이메일 또는 비밀번호가 올바르지 않아요.";

    /** 미가입 요청도 동일 비용의 bcrypt 검증을 수행해 가입 여부의 시간 차이를 줄인다. 인코더 비용을 바꾸면 더미 해시도 맞춘다. */
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$ZZZZZZZZZZZZZZZZZZZZZeZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

    /**
     * rate limit 키와 조회 키를 일관되게 만들기 위한 이메일 정규화.
     * 안 하면 {@code A@x.com} 과 {@code a@x.com} 이 서로 다른 버킷이 되어 계정 단위 제한을 우회한다.
     */
    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    public record SessionStatus(MemberResponse member, boolean refreshPossible) { }
    @GetMapping("/session")
    public ApiResponse<SessionStatus> session(@AuthenticationPrincipal Member member, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        String refresh = CookieUtil.getCookie(request, REFRESH_TOKEN_COOKIE);
        var inspected = member == null && refresh != null ? tokenProvider.inspectRefreshToken(refresh) : null;
        // 갱신 가능성은 화면 복구용 힌트이며 실제 인증은 기존 refresh 관문에서 다시 확인한다.
        boolean refreshPossible = inspected != null && inspected.state() == TokenProvider.RefreshTokenState.VALID;
        return ApiResponse.success(new SessionStatus(member == null ? null : MemberResponse.fromEntity(member), refreshPossible), "로그인 상태예요.");
    }

    public record LoginPolicy(long idleSeconds, long absoluteSeconds) { }
    @GetMapping("/login-policy")
    public ApiResponse<LoginPolicy> loginPolicy(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        return ApiResponse.success(new LoginPolicy(jwtProperties.getRefreshTokenExpiration().toSeconds(),
                jwtProperties.getAbsoluteSessionLifetime().toSeconds()), "로그인 유지 정책이에요.");
    }

    @PostMapping("/login")
    public ApiResponse<?> login(@RequestBody Map<String, String> loginRequest,
                                             HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.LOGIN)) {
            throw new AuthException("로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        String email = normalizeEmail(loginRequest.get("email"));
        String suppliedPassword = loginRequest.get("password");
        // JSON의 명시적 null도 누락과 같은 실패 입력으로 처리한다. BCrypt는 null에 예외를 던진다.
        String rawPassword = suppliedPassword == null ? "" : suppliedPassword;

        // 계정 단위 제한
        // IP 기준(위)만으로는 공격자가 프록시로 IP 를 돌리면 한 계정에 무제한 시도가 된다.
        // 검증 전에 1회를 예약해야 한도를 소진한 계정의 비밀번호 대조도 멈춘다.
        // 성공하면 예약한 1회만 반환하므로 기존 실패 횟수는 유지된다.
        if (!rateLimiter.tryConsume(email, RateLimiter.Policy.LOGIN_ACCOUNT)) {
            log.warn("Login failed: accountQuotaLeft=false");
            throw new AuthException(
                    "로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        // 미가입·소셜 전용·비밀번호 불일치에 같은 응답과 bcrypt 검증 비용을 적용한다.
        Member member = memberService.findByEmailOrNull(email);
        String storedHash = (member != null && member.getPassword() != null)
                ? member.getPassword()
                : DUMMY_PASSWORD_HASH;
        boolean passwordMatches = passwordEncoder.matches(rawPassword, storedHash);

        // 소셜 전용 계정은 로컬 비밀번호가 없다(getPassword() == null) → 위에서 더미 해시로 검증됐으므로
        // 어떤 입력을 넣어도 통과하지 않는다. 즉 별도 분기 없이 자동으로 "실패"가 된다.
        boolean authenticated = member != null && member.getPassword() != null && passwordMatches;

        if (!authenticated) {
            // 알림 규칙이 쓰는 "Login failed" 문구는 유지하되 이메일·IP는 로그에 남기지 않는다.
            log.warn("Login failed: accountQuotaLeft=true");
            throw new AuthException(LOGIN_FAILED_MESSAGE, HttpStatus.UNAUTHORIZED);
        }

        rateLimiter.refund(email, RateLimiter.Policy.LOGIN_ACCOUNT);

        // 자격 증명 검증 통과 후 정지 여부 확인 — 정지 회원은 토큰 발급 없이 로그인 자체를 차단
        // (소셜 로그인의 URL 리다이렉트 방식과 달리, 여기는 일반 JSON 응답이라
        //  사유/기간을 길이 제한 없이 그대로 전달 가능)
        if (member.isSuspended()) {
            boolean isBanned = member.getStatus() == MemberStatus.BANNED;
            String status = isBanned ? "BANNED" : "SUSPENDED";
            String until = (!isBanned && member.getSuspendedUntil() != null)
                ? member.getSuspendedUntil().toLocalDate().toString()
                : null;
            String message = isBanned
                ? "영구 정지된 계정이에요. 관리자에게 문의해주세요."
                : "계정이 " + until + "까지 정지됐어요.";

            throw new MemberSuspendedException(message, status, until, member.getSuspendReason());
        }

        if (mfa != null) mfa.cancel(CookieUtil.getCookie(request, "mfa_ticket"));
        var ticket = mfa == null ? null : mfa.beginLogin(member, null, null, "true".equals(loginRequest.get("rememberMe")));
        if (ticket != null) {
            cookieUtil.deleteCookie(response, ACCESS_TOKEN_COOKIE);
            cookieUtil.deleteCookie(response, REFRESH_TOKEN_COOKIE);
            cookieUtil.addCookie(response, "mfa_ticket", ticket.value(), ticket.persistent() ? 300 : -1);
            response.setHeader("Cache-Control", "no-store");
            return ApiResponse.success(mfa.status(ticket.value(), null, null), "추가 인증이 필요해요.");
        }
        cookieUtil.deleteCookie(response, "mfa_ticket");
        handleTokenIssue(response, member, "true".equals(loginRequest.get("rememberMe")));
        return ApiResponse.success(MemberResponse.fromEntity(member), "로그인 성공");
    }

    @PostMapping("/signup")
    public ApiResponse<MemberResponse> signup(@Valid @RequestBody MemberSignupRequest signupRequest,
                                              HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.SIGNUP)) {
            throw new AuthException("회원가입 시도가 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        Long memberId = memberService.join(signupRequest);
        Member newMember = memberService.findById(memberId);
        handleTokenIssue(response, newMember);
        return ApiResponse.success(MemberResponse.fromEntity(newMember), "회원가입 완료");
    }

    @PostMapping("/refresh")
    public ApiResponse<Void> refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
        String refreshToken = CookieUtil.getCookie(request, REFRESH_TOKEN_COOKIE);
        if (refreshToken == null || refreshToken.isBlank()) {
            throw tokenService.rejectMissingCookie();
        }

        // 갱신해도 최초 로그인에서 선택한 쿠키 수명을 유지한다.
        TokenService.RefreshResult result = tokenService.refresh(refreshToken);

        cookieUtil.addAuthCookies(response, result.accessToken(), result.refreshToken(),
                (int) jwtProperties.getAccessTokenExpiration().toSeconds(), (int) result.refreshMaxAge().toSeconds(), result.persistent());

        // 토큰은 HttpOnly 쿠키로만 전달한다. 응답 본문에 복제하면 XSS 노출면만 넓어진다.
        return ApiResponse.success(null, "토큰 재발급 성공");
        } catch (AuthException rejected) {
            cookieUtil.deleteCookie(response, ACCESS_TOKEN_COOKIE);
            cookieUtil.deleteCookie(response, REFRESH_TOKEN_COOKIE);
            throw rejected;
        }
    }

    /**
     * 소셜 로그인 신규 가입 시 약관 동의 처리.
     * termsAgreed(필수)는 서버에서 true로 세팅, marketingAgreed(선택)는 body에서 수신.
     * body 미전송 시 marketingAgreed = false (보수적 기본값).
     */
    @PostMapping("/agree-terms")
    public ApiResponse<Void> agreeTerms(
            @AuthenticationPrincipal Member member,
            @RequestBody(required = false) Map<String, Boolean> body) {
        boolean marketingAgreed = body != null && Boolean.TRUE.equals(body.get("marketingAgreed"));
        memberService.agreeTerms(member.getId(), marketingAgreed);
        return ApiResponse.success(null, "약관 동의 완료");
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        try {
        if (loginMethods != null) loginMethods.cancelOAuth(request);
        if (mfa != null) mfa.cancel(CookieUtil.getCookie(request, "mfa_ticket"));
        for (String refreshToken : CookieUtil.getCookieValues(request, REFRESH_TOKEN_COOKIE)) {
            tokenService.revoke(refreshToken);
        }
        } finally {
        cookieUtil.deleteCookie(response, ACCESS_TOKEN_COOKIE);
        cookieUtil.deleteCookie(response, REFRESH_TOKEN_COOKIE);

        var session = request.getSession(false);
        if (session != null) session.invalidate();
        cookieUtil.deleteCookie(response, "JSESSIONID");
        cookieUtil.deleteCookie(response, "mfa_ticket");
        }

        return ApiResponse.success(null, "로그아웃 성공");
    }

    private void handleTokenIssue(HttpServletResponse response, Member member) {
        TokenProvider.IssuedSession pair = tokenProvider.issueSession(member, null);

        authCookies(response, pair);
    }
    private void handleTokenIssue(HttpServletResponse response, Member member, boolean persistent) {
        authCookies(response, tokenProvider.issueSession(member, null, persistent));
    }
    private void authCookies(HttpServletResponse response, TokenProvider.IssuedSession pair) {
        cookieUtil.addAuthCookies(response, pair.accessToken(), pair.refreshToken(),
                (int) jwtProperties.getAccessTokenExpiration().toSeconds(), (int) pair.refreshMaxAge().toSeconds(), pair.persistent());
    }
}
