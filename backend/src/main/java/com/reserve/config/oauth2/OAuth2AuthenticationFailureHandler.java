package com.reserve.config.oauth2;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * OAuth2 로그인 실패 시 처리하는 핸들러
 */
@Slf4j
@Component
public class OAuth2AuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException, ServletException {
        
        log.error("❌ OAuth2 로그인 실패: {}", exception.getMessage());

        // 리액트 앱의 로그인 페이지로 리다이렉트 (에러 메시지 포함)
        String errorMessage = URLEncoder.encode(exception.getMessage(), StandardCharsets.UTF_8);
        String targetUrl = "http://localhost:5173/login?error=oauth2&message=" + errorMessage;

        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }
}
