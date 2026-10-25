package kr.it.reserve.config.oauth2;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import java.net.URI;
import java.util.List;
import java.util.Set;

/** 설정된 신뢰 출처 안에서만 콜백 호스트를 선택해 OAuth 세션 쿠키를 같은 호스트에 유지한다. */
public final class TrustedOAuth2AuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {
    private final DefaultOAuth2AuthorizationRequestResolver delegate;
    private final Set<String> allowed;
    private final kr.it.reserve.member.service.LoginMethodService loginMethods;
    public TrustedOAuth2AuthorizationRequestResolver(ClientRegistrationRepository clients, List<String> origins) {
        this(clients, origins, null);
    }
    public TrustedOAuth2AuthorizationRequestResolver(ClientRegistrationRepository clients, List<String> origins,
            kr.it.reserve.member.service.LoginMethodService loginMethods) {
        delegate = new DefaultOAuth2AuthorizationRequestResolver(clients, "/oauth2/authorization");
        allowed = Set.copyOf(origins);
        this.loginMethods = loginMethods;
    }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request) { return bound(request, checked(delegate.resolve(request))); }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String registrationId) { return bound(request, checked(delegate.resolve(request, registrationId))); }
    private OAuth2AuthorizationRequest bound(HttpServletRequest request, OAuth2AuthorizationRequest authorization) {
        if (loginMethods == null && request.getParameter("account_link") != null)
            throw new OAuth2AuthenticationException(new OAuth2Error("invalid_request"), "Login method linking is unavailable");
        return loginMethods == null ? authorization : loginMethods.bindOAuth(request, authorization);
    }
    private OAuth2AuthorizationRequest checked(OAuth2AuthorizationRequest request) {
        if (request == null) return null;
        URI uri = URI.create(request.getRedirectUri());
        String origin = uri.getScheme() + "://" + uri.getRawAuthority();
        if (!allowed.contains(origin) || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || !Set.of("/login/oauth2/code/google", "/login/oauth2/code/naver", "/login/oauth2/code/kakao").contains(uri.getPath()))
            throw new OAuth2AuthenticationException(new OAuth2Error("invalid_request"), "Untrusted OAuth callback origin");
        return request;
    }
}
