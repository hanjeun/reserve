package com.reserve.config.oauth2;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * OAuth2 로그인 실패 시 처리하는 핸들러
 * errorCode를 한국어 메시지로 변환하여 /login?error=oauth2&message=... 로 리다이렉트
 */
@Slf4j
@Component
public class OAuth2AuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Value("${server.env:prod}")
    private String serverEnv;

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException, ServletException {

        log.error("❌ OAuth2 로그인 실패: {}", exception.getMessage());

        String rawMessage = resolveMessage(exception);
        String errorMessage = URLEncoder.encode(rawMessage, StandardCharsets.UTF_8);
        String baseUrl = "local".equals(serverEnv)
                ? "http://localhost:5173"
                : "https://reserve.hktech.kr";

        getRedirectStrategy().sendRedirect(request, response, baseUrl + "/login?error=oauth2&message=" + errorMessage);
    }

    private String resolveMessage(AuthenticationException exception) {
        // 우리가 직접 throw한 경우 — getMessage()에 한국어 메시지가 있음
        String msg = exception.getMessage();
        if (msg != null && !msg.isBlank()) {
            return msg;
        }

        // Spring Security가 자동으로 throw한 경우 — errorCode로 분기
        String errorCode = "";
        if (exception instanceof OAuth2AuthenticationException oaEx) {
            errorCode = oaEx.getError() != null ? oaEx.getError().getErrorCode() : "";
        }

        return switch (errorCode) {
            case "access_denied"                   -> "소셜 로그인을 취소했습니다.";
            case "authorization_request_not_found" -> "로그인 요청이 만료되었습니다. 다시 시도해주세요.";
            case "invalid_state"                   -> "잘못된 로그인 요청입니다. 다시 시도해주세요.";
            default                                -> "소셜 로그인에 실패했습니다. 다시 시도해주세요.";
        };
    }
}
