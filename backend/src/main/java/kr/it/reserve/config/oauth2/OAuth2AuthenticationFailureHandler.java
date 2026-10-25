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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * OAuth2 로그인 실패 시 처리하는 핸들러
 * errorCode를 한국어 메시지로 변환하여 /login?error=oauth2&message=... 로 리다이렉트
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

        log.error("OAuth2 login failed: errorType={}", exception.getClass().getSimpleName());
        kr.it.reserve.member.service.LoginMethodService.clearFlow(request);

        String rawMessage = resolveMessage(exception);
        String errorMessage = URLEncoder.encode(rawMessage, StandardCharsets.UTF_8);
        String baseUrl = siteUrls == null ? frontendUrl : siteUrls.frontendFor(request);

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
            case "access_denied"                   -> "소셜 로그인을 취소했어요.";
            case "authorization_request_not_found" -> "로그인 요청이 만료됐어요. 다시 시도해주세요.";
            case "invalid_state"                   -> "잘못된 로그인 요청이에요. 다시 시도해주세요.";
            case "email_conflict"                  -> "이미 가입된 이메일이에요. 기존 가입 방식으로 로그인해주세요.";
            case "login_method_expired"            -> "로그인 방법 변경 요청이 만료됐어요. 기존 계정으로 로그인한 뒤 다시 진행해주세요.";
            case "login_method_conflict"           -> "이미 연결된 소셜 계정이에요. 기존 연결을 확인해주세요.";
            case "login_method_email_mismatch"     -> "현재 RESERVE 계정과 같은 이메일의 인증된 소셜 계정을 사용해주세요.";
            case "login_method_identity_mismatch"  -> "처음 연결한 소셜 계정으로 본인 확인해주세요.";
            case "oauth_reauthentication_required" -> "계정 보호를 위해 소셜 로그인을 다시 진행해주세요.";
            default                                -> "소셜 로그인에 실패했어요. 다시 시도해주세요.";
        };
    }
}
