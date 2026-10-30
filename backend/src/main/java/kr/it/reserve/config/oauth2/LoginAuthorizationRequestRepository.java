package kr.it.reserve.config.oauth2;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

// 콜백의 쿼리가 아니라 state로 확인한 최초 요청에서 로그인 유지 선택을 가져온다.
public final class LoginAuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
    public static final String PERSISTENT = LoginAuthorizationRequestRepository.class.getName() + ".persistent";
    private final HttpSessionOAuth2AuthorizationRequestRepository delegate = new HttpSessionOAuth2AuthorizationRequestRepository();
    @Override public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return delegate.loadAuthorizationRequest(request);
    }
    @Override public void saveAuthorizationRequest(OAuth2AuthorizationRequest value, HttpServletRequest request, HttpServletResponse response) {
        delegate.saveAuthorizationRequest(value, request, response);
    }
    @Override public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request, HttpServletResponse response) {
        request.removeAttribute(PERSISTENT);
        OAuth2AuthorizationRequest saved = delegate.removeAuthorizationRequest(request, response);
        if (saved != null) request.setAttribute(PERSISTENT, Boolean.TRUE.equals(saved.getAttribute(PERSISTENT)));
        return saved;
    }
    public static boolean persistent(HttpServletRequest request) { return Boolean.TRUE.equals(request.getAttribute(PERSISTENT)); }
}
