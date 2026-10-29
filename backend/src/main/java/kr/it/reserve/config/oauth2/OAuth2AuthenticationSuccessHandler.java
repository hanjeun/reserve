package kr.it.reserve.config.oauth2;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.member.entity.Member;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import kr.it.reserve.config.SiteUrls;
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

    private final OAuthSessionIssuer sessionIssuer;
    private final JwtProperties jwtProperties;
    private final CookieUtil cookieUtil;
    private final OAuth2AuthenticationFailureHandler failureHandler;

    @Value("${server.env:prod}")
    private String serverEnv;
    @Value("#{siteUrls.frontendOrigin}")
    private String frontendUrl = kr.it.reserve.config.SiteUrls.DEFAULT_APP_ORIGIN;
    @Autowired private SiteUrls siteUrls;
    @Autowired private kr.it.reserve.member.mfa.MfaService mfa;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        CustomOAuth2User oAuth2User = (CustomOAuth2User) authentication.getPrincipal();
        Member member = oAuth2User.getMember();
        String destination = siteUrls == null ? frontendUrl : siteUrls.frontendFor(request);

        log.info("OAuth2 login success: memberId={}", member.getId());

        // 정지 상태 체크
        // URL에 한국어 메시지를 인코딩하면 이상한 URL이 되므로
        // 상태 코드 + 정지 해제일만 전달 → 프론트에서 디코딩하여 UI 표시
        if (member.isSuspended()) {
            boolean isBanned = "BANNED".equals(member.getStatus().name());
            String status = isBanned ? "BANNED" : "SUSPENDED";
            String until = (!isBanned && member.getSuspendedUntil() != null)
                ? member.getSuspendedUntil().toLocalDate().toString()
                : "";

            String baseErrorUrl = destination + "/login";

            String redirectUrl = baseErrorUrl
                + "?suspended=true"
                + "&status=" + status
                + (until.isEmpty() ? "" : "&until=" + until);

            log.warn("OAuth2 login blocked: memberId={}, status={}, until={}", member.getId(), status, until);
            getRedirectStrategy().sendRedirect(request, response, redirectUrl);
            return;
        }

        // 1. 토큰 생성
        OAuthSessionIssuer.SessionTokens pair;
        try {
            if (mfa != null) mfa.cancel(CookieUtil.getCookie(request, "mfa_ticket"));
            pair = sessionIssuer.issue(oAuth2User, LoginAuthorizationRequestRepository.persistent(request));
        } catch (org.springframework.security.oauth2.core.OAuth2AuthenticationException exception) {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
            clearSessionAndCookies(request, response);
            failureHandler.onAuthenticationFailure(request, response, exception);
            return;
        }
        if (pair.mfaTicket() != null) {
            cookieUtil.deleteCookie(response, "access_token");
            cookieUtil.deleteCookie(response, "refresh_token");
            cookieUtil.addCookie(response, "mfa_ticket", pair.mfaTicket(), pair.persistent() ? 300 : -1);
            clearSessionAndCookies(request, response);
            getRedirectStrategy().sendRedirect(request, response, destination + "/login?mfa=1" + (oAuth2User.isLoginMethodAction() ? "&security=1" : ""));
            return;
        }
        cookieUtil.deleteCookie(response, "mfa_ticket");
        String accessToken = pair.accessToken();
        String refreshToken = pair.refreshToken();

        // 2. CookieUtil을 사용한 쿠키 저장 (중복 메서드 제거)
        int accessMaxAge = (int) jwtProperties.getAccessTokenExpiration().toSeconds();
        int refreshMaxAge = (int) (pair.refreshMaxAge() == null ? jwtProperties.getRefreshTokenExpiration() : pair.refreshMaxAge()).toSeconds();

        cookieUtil.addAuthCookies(response, accessToken, refreshToken, accessMaxAge, refreshMaxAge, pair.persistent());

        // 3. 세션 및 기존 쿠키 정리
        clearSessionAndCookies(request, response);

        // 4. 리액트 앱으로 리다이렉트
        // 신규 유저(약관 미동의)면 newUser=true 파라미터 추가
        String baseUrl = destination + "/oauth2/callback";
        String redirectUrl = oAuth2User.isLoginMethodAction() ? destination + "/my-page"
                : oAuth2User.isNewUser() ? baseUrl + "?newUser=true" : baseUrl;
        log.info("OAuth2 redirect: url={}, env={}, newUser={}", redirectUrl, serverEnv, oAuth2User.isNewUser());
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }

    private void clearSessionAndCookies(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        cookieUtil.deleteCookie(response, "JSESSIONID");
    }
}
