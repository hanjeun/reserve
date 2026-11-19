package kr.it.reserve.config;

import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import kr.it.reserve.config.oauth2.OAuthLoginOutcome;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.assertThat;

class OAuth2FailureMessageSafetyTest {
    private final OAuth2AuthenticationFailureHandler handler = new OAuth2AuthenticationFailureHandler();

    @ParameterizedTest
    @ValueSource(strings = {"ip_verification_unavailable", "authorization_request_not_found", "invalid_state",
            "login_method_expired", "email_conflict", "login_method_email_mismatch", "login_method_identity_mismatch"})
    void recognizedFailureKeepsOnlyItsAllowlistedCode(String code) throws Exception {
        assertOutcome(new OAuth2AuthenticationException(new OAuth2Error(code), "synthetic private provider detail"), code);
    }

    @Test
    void unknownProviderDetailUsesGenericCode() throws Exception {
        assertOutcome(new AuthenticationServiceException("synthetic private provider detail"), "login_failed");
        assertOutcome(new OAuth2AuthenticationException(new OAuth2Error("unknown_provider_error"),
                "synthetic private provider detail"), "login_failed");
    }

    private void assertOutcome(AuthenticationException failure, String expected) throws Exception {
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        handler.onAuthenticationFailure(request, response, failure);

        String location = response.getRedirectedUrl();
        assertThat(location).contains("/login?error=oauth2&result=")
                .doesNotContain("message=", "status=", "synthetic", expected);
        String reference = UriComponentsBuilder.fromUriString(location).build().getQueryParams().getFirst("result");
        assertThat(OAuthLoginOutcome.take(new MockHttpServletRequest(), reference)).isNull();
        assertThat(OAuthLoginOutcome.take(request, reference)).isEqualTo(new OAuthLoginOutcome.View(expected));
        assertThat(OAuthLoginOutcome.take(request, reference)).isNull();
    }
}
