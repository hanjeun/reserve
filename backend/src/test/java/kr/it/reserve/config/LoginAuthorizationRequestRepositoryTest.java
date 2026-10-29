package kr.it.reserve.config;

import kr.it.reserve.config.oauth2.LoginAuthorizationRequestRepository;
import kr.it.reserve.config.oauth2.TrustedOAuth2AuthorizationRequestResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class LoginAuthorizationRequestRepositoryTest {
    private OAuth2AuthorizationRequest saved(boolean persistent) {
        return OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://provider.example/authorize")
                .clientId("synthetic-client").redirectUri("https://app.reserve.it.kr/login/oauth2/code/google")
                .state("synthetic-state").attributes(Map.of(LoginAuthorizationRequestRepository.PERSISTENT, persistent)).build();
    }
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void callbackQueryCannotOverrideTheChoiceBoundToState(boolean persistent) {
        var repository = new LoginAuthorizationRequestRepository();
        var start = new MockHttpServletRequest();
        repository.saveAuthorizationRequest(saved(persistent), start, new MockHttpServletResponse());
        var callback = new MockHttpServletRequest();
        callback.setSession((MockHttpSession) start.getSession());
        callback.setParameter("state", "synthetic-state");
        callback.setParameter("rememberMe", String.valueOf(!persistent));
        assertThat(repository.removeAuthorizationRequest(callback, new MockHttpServletResponse())).isNotNull();
        assertThat(LoginAuthorizationRequestRepository.persistent(callback)).isEqualTo(persistent);
        assertThat(repository.loadAuthorizationRequest(callback)).isNull();
    }
    @Test void wrongStateDoesNotRestoreAChoice() {
        var repository = new LoginAuthorizationRequestRepository();
        var start = new MockHttpServletRequest();
        repository.saveAuthorizationRequest(saved(true), start, new MockHttpServletResponse());
        var callback = new MockHttpServletRequest();
        callback.setSession((MockHttpSession) start.getSession());
        callback.setParameter("state", "wrong-state");
        callback.setAttribute(LoginAuthorizationRequestRepository.PERSISTENT, true);
        assertThat(repository.removeAuthorizationRequest(callback, new MockHttpServletResponse())).isNull();
        assertThat(LoginAuthorizationRequestRepository.persistent(callback)).isFalse();
    }
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void resolverKeepsThePreferenceOutOfTheProviderRequest(boolean persistent) {
        var client = ClientRegistration.withRegistrationId("google").clientId("synthetic-client").clientSecret("synthetic")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("https://app.reserve.it.kr/login/oauth2/code/google")
                .authorizationUri("https://provider.example/authorize").tokenUri("https://provider.example/token")
                .userInfoUri("https://provider.example/user").userNameAttributeName("sub").build();
        var resolver = new TrustedOAuth2AuthorizationRequestResolver(new InMemoryClientRegistrationRepository(client), List.of("https://app.reserve.it.kr"));
        var request = new MockHttpServletRequest("GET", "/oauth2/authorization/google");
        request.setServletPath("/oauth2/authorization/google");
        request.setParameter("rememberMe", String.valueOf(persistent));
        var authorization = resolver.resolve(request);
        assertThat(authorization).isNotNull();
        assertThat(authorization.<Boolean>getAttribute(LoginAuthorizationRequestRepository.PERSISTENT)).isEqualTo(persistent);
        assertThat(authorization.getAuthorizationRequestUri()).doesNotContain("rememberMe", "persistent");
    }
}
