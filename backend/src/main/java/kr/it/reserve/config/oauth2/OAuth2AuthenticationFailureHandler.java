package kr.it.reserve.config.oauth2;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import kr.it.reserve.config.SiteUrls;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * OAuth2 로그인 실패 시 처리하는 핸들러
 * 허용된 코드만 현재 브라우저 세션에 전달한다.
 */
@Slf4j
@Component
public class OAuth2AuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Value("#{siteUrls.frontendOrigin}")
    private String frontendUrl = kr.it.reserve.config.SiteUrls.DEFAULT_APP_ORIGIN;
    @Autowired private SiteUrls siteUrls;

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException, ServletException {

        if (exception instanceof OAuth2AuthenticationException) log.warn("OAuth2 authentication rejected: errorType={}", exception.getClass().getSimpleName());
        else log.error("OAuth2 login failed: errorType={}", exception.getClass().getSimpleName());
        kr.it.reserve.member.service.LoginMethodService.clearFlow(request);

        String baseUrl = siteUrls == null ? frontendUrl : siteUrls.frontendFor(request);
        getRedirectStrategy().sendRedirect(request, response,
                OAuthLoginOutcome.redirect(request, baseUrl, new OAuthLoginOutcome.View(resolveCode(exception))));
    }

    private String resolveCode(AuthenticationException exception) {
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

        return switch (errorCode) {
            case "access_denied", "authorization_request_not_found", "invalid_state", "email_conflict",
                    "login_method_expired", "login_method_conflict", "login_method_email_mismatch",
                    "login_method_identity_mismatch", "oauth_reauthentication_required", "ip_verification_unavailable", "account_protected" -> errorCode;
            default -> "login_failed";
        };
    }
}
