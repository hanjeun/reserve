package kr.it.reserve.config.oauth2;

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

        log.error("OAuth2 login failed: errorType={}", exception.getClass().getSimpleName());

        String rawMessage = resolveMessage(exception);
        String errorMessage = URLEncoder.encode(rawMessage, StandardCharsets.UTF_8);
        String baseUrl = "local".equals(serverEnv)
                ? "http://localhost:5173"
                : "https://reserve.it.kr";

        getRedirectStrategy().sendRedirect(request, response, baseUrl + "/login?error=oauth2&message=" + errorMessage);
    }

    private String resolveMessage(AuthenticationException exception) {
        log.debug("OAuth2 failure type: {}", exception.getClass().getName());

        // 예외 원문은 공급자 응답·이메일·내부 구현 정보를 포함할 수 있으므로 URL로 전달하지 않는다.
        // 사용자 문구는 신뢰할 수 있는 errorCode만 허용 목록으로 매핑한다.
        String msg = exception.getMessage();
        String errorCode = "";
        if (exception instanceof OAuth2AuthenticationException oaEx && oaEx.getError() != null) {
            errorCode = oaEx.getError().getErrorCode();
        }
        // 메시지에서 errorCode 추출 시도 ([errorCode] message 형식)
        if (errorCode.isBlank() && msg != null && msg.startsWith("[")) {
            int end = msg.indexOf("]");
            if (end > 0) errorCode = msg.substring(1, end);
        }

        log.debug("OAuth2 errorCode: {}", errorCode);

        return switch (errorCode) {
            case "access_denied"                   -> "소셜 로그인을 취소했습니다.";
            case "authorization_request_not_found" -> "로그인 요청이 만료되었습니다. 다시 시도해주세요.";
            case "invalid_state"                   -> "잘못된 로그인 요청입니다. 다시 시도해주세요.";
            case "email_conflict"                  -> "이미 가입된 이메일입니다. 기존 가입 방식으로 로그인해주세요.";
            default                                -> "소셜 로그인에 실패했습니다. 다시 시도해주세요.";
        };
    }
}
