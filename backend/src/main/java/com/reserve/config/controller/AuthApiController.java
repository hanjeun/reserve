package com.reserve.config.controller;

import com.reserve.config.jwt.JwtProperties;
import com.reserve.config.jwt.TokenProvider;
import com.reserve.config.jwt.repository.RefreshTokenRepository;
import com.reserve.config.service.TokenService;
import com.reserve.config.util.CookieUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.AuthException;
import com.reserve.global.ratelimit.IpExtractor;
import com.reserve.global.ratelimit.RateLimiter;
import com.reserve.member.dto.MemberDto;
import com.reserve.member.dto.MemberResponse;
import com.reserve.member.entity.Member;
import com.reserve.member.service.MemberService;
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

        // 정지 상태는 로그인은 허용하되 MemberResponse에 status 포함하여 프론트에서 배너 표시
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
        // 1. 쿠키에서 리프레시 토큰 추출 (CookieUtil 활용)
        String refreshToken = CookieUtil.getCookie(request, "refresh_token");
        if (refreshToken == null) {
            throw new AuthException("리프레시 토큰이 쿠키에 존재하지 않습니다.");
        }

        // 2. 서비스 호출 (내부에서 검증 및 새로운 토큰 생성)
        String newAccessToken = tokenService.createNewAccessToken(refreshToken);

        // 3. 새로운 액세스 토큰 쿠키 업데이트
        CookieUtil.addCookie(response, "access_token", newAccessToken,
                (int) jwtProperties.getAccessTokenExpiration().toSeconds());

        return ApiResponse.success(newAccessToken, "토큰 재발급 성공");
    }

    @PostMapping("/agree-terms")
    public ApiResponse<Void> agreeTerms(@AuthenticationPrincipal Member member) {
        memberService.agreeTerms(member.getId());
        return ApiResponse.success(null, "약관 동의 완료");
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = CookieUtil.getCookie(request, "refresh_token");
        if (refreshToken != null) {
            refreshTokenRepository.deleteByRefreshToken(refreshToken); // 레포지토리에 삭제 메서드 필요
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