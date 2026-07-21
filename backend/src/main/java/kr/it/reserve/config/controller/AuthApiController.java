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
import kr.it.reserve.member.dto.MemberDto;
import kr.it.reserve.member.dto.MemberResponse;
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

    @PostMapping("/login")
    public ApiResponse<MemberResponse> login(@RequestBody Map<String, String> loginRequest,
                                             HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.LOGIN)) {
            throw new AuthException("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        Member member = memberService.findByEmail(loginRequest.get("email"));

        if (member.isOAuthUser()) {
            throw new AuthException(member.getProvider().name() + " 계정 로그인을 이용해주세요.");
        }

        if (!passwordEncoder.matches(loginRequest.get("password"), member.getPassword())) {
            throw new AuthException("비밀번호가 일치하지 않습니다.");
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
    public ApiResponse<MemberResponse> signup(@RequestBody MemberDto memberDto,
                                              HttpServletRequest request, HttpServletResponse response) {
        String ip = IpExtractor.extract(request);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.SIGNUP)) {
            throw new AuthException("회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        Long memberId = memberService.join(memberDto);
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
