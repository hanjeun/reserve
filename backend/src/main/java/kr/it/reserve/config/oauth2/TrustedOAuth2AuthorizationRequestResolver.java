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

/** Dynamic callback keeps the OAuth session on its host, constrained to configured trusted origins. */
public final class TrustedOAuth2AuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {
    private final DefaultOAuth2AuthorizationRequestResolver delegate;
    private final Set<String> allowed;
    public TrustedOAuth2AuthorizationRequestResolver(ClientRegistrationRepository clients, List<String> origins) {
        delegate = new DefaultOAuth2AuthorizationRequestResolver(clients, "/oauth2/authorization");
        allowed = Set.copyOf(origins);
    }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request) { return checked(delegate.resolve(request)); }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String registrationId) { return checked(delegate.resolve(request, registrationId)); }
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
