package kr.it.reserve.config.controller;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
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
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/auth")
public class AuthApiController {

    private final MemberService memberService;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtProperties jwtProperties;
    private final RefreshTokenRepository refreshTokenRepository;
    private final TokenService tokenService;
    private final RateLimiter rateLimiter;

    /**
     * 로그인 실패 시 내보내는 <b>유일한</b> 문구. 미가입·소셜계정·비번불일치를 구분하지 않는다.
     * 문구를 나누면 그 자체가 계정 존재 여부를 알려주는 신호가 된다.
     */
    private static final String LOGIN_FAILED_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

    /**
     * 계정이 없을 때도 bcrypt 를 한 번 태우기 위한 더미 해시 (타이밍 사이드채널 방어).
     *
     * <p>이 값은 <b>어떤 평문과도 일치하지 않아야</b> 한다. 아래 값은 bcrypt 형식은 유효하지만
     * 해시 본문이 임의 문자열이라 어떤 입력도 통과하지 않는다.
     * 비용 인자(10)는 실제 회원 비밀번호와 같은 수준이어야 의미가 있다 —
     * 여기가 더 낮으면 여전히 미가입이 빠르게 응답해서 구분이 가능하다.
     * ⚠️ 실제 비밀번호 인코더의 strength 를 바꾸면 이 값의 비용 인자도 함께 맞출 것.
     */
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$ZZZZZZZZZZZZZZZZZZZZZeZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

    /**
     * rate limit 키와 조회 키를 일관되게 만들기 위한 이메일 정규화.
     * 안 하면 {@code A@x.com} 과 {@code a@x.com} 이 서로 다른 버킷이 되어 계정 단위 제한을 우회한다.
     */
    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    @PostMapping("/login")
    public ApiResponse<MemberResponse> login(@RequestBody Map<String, String> loginRequest,
                                             HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.LOGIN)) {
            throw new AuthException("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        String email = normalizeEmail(loginRequest.get("email"));
        String rawPassword = loginRequest.get("password");

        // ── 계정 단위 제한 ────────────────────────────────────────────────
        // IP 기준(위)만으로는 공격자가 프록시로 IP 를 돌리면 한 계정에 무제한 시도가 된다.
        // 여기서 "소모"는 하지 않고, 아래에서 **검증에 실패했을 때만** 소모한다.
        // (성공한 로그인이 카운터를 쓰면 기기 여러 대를 쓰는 정상 사용자가 걸린다)

        // ── ★ 응답을 갈라놓지 않는다 (user enumeration 차단) ──────────────
        // 예전에는 세 갈래였다:
        //   미가입      → 404 "회원을 찾을 수 없습니다."
        //   소셜 계정   → 400 "GOOGLE 계정 로그인을 이용해주세요."   ← 가입 방식까지 노출
        //   비번 틀림   → 401 "비밀번호가 일치하지 않습니다."
        // 비밀번호를 하나도 모르는 사람이 이메일만 넣어보고 ①가입 여부 ②가입 방식을
        // 확정할 수 있었다. 특히 ②는 "구글로 가입하셨죠?" 라고 정확히 아는 피싱에 바로 쓰인다.
        // → 세 경우 모두 같은 401 + 같은 문구로 통일한다(OWASP 권고).
        //
        // ★ 타이밍도 균일하게 맞춘다.
        //   미가입이면 bcrypt 검증을 아예 타지 않아 응답이 확연히 빠르다(bcrypt 는 의도적으로 느리다).
        //   문구만 통일해도 응답 시간 차이로 가입 여부를 구분할 수 있으므로,
        //   계정이 없을 때도 더미 해시로 한 번 검증을 태워 소요 시간을 비슷하게 만든다.
        Member member = memberService.findByEmailOrNull(email);
        String storedHash = (member != null && member.getPassword() != null)
                ? member.getPassword()
                : DUMMY_PASSWORD_HASH;
        boolean passwordMatches = passwordEncoder.matches(rawPassword, storedHash);

        // 소셜 전용 계정은 로컬 비밀번호가 없다(getPassword() == null) → 위에서 더미 해시로 검증됐으므로
        // 어떤 입력을 넣어도 통과하지 않는다. 즉 별도 분기 없이 자동으로 "실패"가 된다.
        boolean authenticated = member != null && member.getPassword() != null && passwordMatches;

        if (!authenticated) {
            // 실패한 시도만 계정 카운터를 소모한다.
            boolean accountQuotaLeft = rateLimiter.tryConsume(email, RateLimiter.Policy.LOGIN_ACCOUNT);
            // 알림 규칙이 쓰는 "Login failed" 문구는 유지하되 이메일·IP는 로그에 남기지 않는다.
            log.warn("Login failed: accountQuotaLeft={}", accountQuotaLeft);
            if (!accountQuotaLeft) {
                throw new AuthException(
                        "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
            }
            throw new AuthException(LOGIN_FAILED_MESSAGE, HttpStatus.UNAUTHORIZED);
        }

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
                ? "영구 정지된 계정입니다. 관리자에게 문의해주세요."
                : "계정이 " + until + "까지 정지되었습니다.";

            throw new MemberSuspendedException(message, status, until, member.getSuspendReason());
        }

        handleTokenIssue(response, member);
        return ApiResponse.success(MemberResponse.fromEntity(member), "로그인 성공");
    }

    @PostMapping("/signup")
    public ApiResponse<MemberResponse> signup(@RequestBody MemberSignupRequest signupRequest,
                                              HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.SIGNUP)) {
            throw new AuthException("회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        Long memberId = memberService.join(signupRequest);
        Member newMember = memberService.findById(memberId);
        handleTokenIssue(response, newMember);
        return ApiResponse.success(MemberResponse.fromEntity(newMember), "회원가입 완료");
    }

    @PostMapping("/refresh")
    public ApiResponse<String> createNewAccessToken(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = CookieUtil.getCookie(request, "refresh_token");
        if (refreshToken == null) {
            throw new AuthException("리프레시 토큰이 쿠키에 존재하지 않습니다.");
        }

        String newAccessToken = tokenService.createNewAccessToken(refreshToken);

        CookieUtil.addCookie(response, "access_token", newAccessToken,
                (int) jwtProperties.getAccessTokenExpiration().toSeconds());

        return ApiResponse.success(newAccessToken, "토큰 재발급 성공");
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
        String refreshToken = CookieUtil.getCookie(request, "refresh_token");
        if (refreshToken != null) {
            refreshTokenRepository.deleteByRefreshToken(refreshToken);
        }
        CookieUtil.deleteCookie(request, response, "access_token");
        CookieUtil.deleteCookie(request, response, "refresh_token");

        return ApiResponse.success(null, "로그아웃 성공");
    }

    private void handleTokenIssue(HttpServletResponse response, Member member) {
        String accessToken = tokenProvider.generateAccessToken(member);
        String refreshToken = tokenProvider.generateRefreshToken(member);

        CookieUtil.addCookie(response, "access_token", accessToken, (int) jwtProperties.getAccessTokenExpiration().toSeconds());
        CookieUtil.addCookie(response, "refresh_token", refreshToken, (int) jwtProperties.getRefreshTokenExpiration().toSeconds());
    }
}
