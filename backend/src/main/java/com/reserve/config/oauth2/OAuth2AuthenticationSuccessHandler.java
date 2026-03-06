package com.reserve.config.oauth2;

import com.reserve.config.jwt.JwtProperties;
import com.reserve.config.jwt.TokenProvider;
import com.reserve.config.util.CookieUtil;
import com.reserve.member.entity.Member;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * OAuth2 로그인 성공 시 JWT 토큰을 발급하고 리다이렉트하는 핸들러
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final TokenProvider tokenProvider;
    private final JwtProperties jwtProperties;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        CustomOAuth2User oAuth2User = (CustomOAuth2User) authentication.getPrincipal();
        Member member = oAuth2User.getMember();

        log.info("OAuth2 로그인 성공: {}", member.getEmail());

        // 1. 토큰 생성
        String accessToken = tokenProvider.generateAccessToken(member);
        String refreshToken = tokenProvider.generateRefreshToken(member);

        // 2. CookieUtil을 사용한 쿠키 저장 (중복 메서드 제거)
        int accessMaxAge = (int) jwtProperties.getAccessTokenExpiration().toSeconds();
        int refreshMaxAge = (int) jwtProperties.getRefreshTokenExpiration().toSeconds();

        CookieUtil.addCookie(response, "access_token", accessToken, accessMaxAge);
        CookieUtil.addCookie(response, "refresh_token", refreshToken, refreshMaxAge);

        // 3. 세션 및 기존 쿠키 정리
        clearSessionAndCookies(request, response);

        // 4. 리액트 앱으로 리다이렉트
        // 프론트엔드에서 쿠키의 토큰을 자동으로 읽어서 사용
        String redirectUrl = request.getHeader("Origin") != null && request.getHeader("Origin").contains("localhost")
                ? "http://localhost:5173/oauth2/callback"
                : "https://reserve.hktech.kr/oauth2/callback";
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }

    private void clearSessionAndCookies(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        CookieUtil.deleteCookie(request, response, "JSESSIONID");
    }
}
