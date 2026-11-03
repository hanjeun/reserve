package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class IpProtectionFilterTest {
    private final IpLoginProtection protection = mock(IpLoginProtection.class);
    private final IpProtectionFilter filter = new IpProtectionFilter(protection, new ObjectMapper().findAndRegisterModules());

    @ParameterizedTest @ValueSource(strings = {"/api/auth/login", "/api/v1/auth/mfa/verify", "/oauth2/authorization/google"})
    void blockedAnonymousRequestsHaveAFiniteRetryWithoutCallingTheApplication(String path) throws Exception {
        when(protection.enabled()).thenReturn(true);
        when(protection.blocked(any())).thenReturn(1501L);
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", path), response, (request, reply) -> fail("Blocked request reached application"));
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isEqualTo("2");
        assertThat(response.getContentAsString()).contains("일시적으로 제한").doesNotContain("계정이 잠");
        verify(protection, never()).failed(any());
    }
    @ParameterizedTest @ValueSource(strings = {"/api/stores", "/api/v1/stores", "/api/member", "/api/reservations/my", "/api/updates/events", "/hc", "/actuator/health", "/api/auth/logout", "/api/auth/refresh",
            "/api/auth/mfa/cancel", "/api/payment/webhook/portone", "/api/v1/payment/webhook/portone",
            "/api/oauth/events/google", "/login/oauth2/code/google"})
    void recoveryAndSignedProviderCallbacksKeepTheirOwnAuthenticationBoundary(String path) throws Exception {
        when(protection.enabled()).thenReturn(true);
        when(protection.blocked(any())).thenReturn(900000L);
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST", path), response, (request, reply) -> response.setStatus(204));
        assertThat(response.getStatus()).isEqualTo(204);
        verify(protection, never()).blocked(any());
    }
    @Test void disabledProtectionDoesNotReadIpHistory() throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST", "/api/auth/login"), response, (request, reply) -> response.setStatus(401));
        verify(protection, never()).blocked(any());
        verify(protection, never()).failed(any());
    }
    @Test void activeProtectionAndExistingLimitsUseTheSameVerifiedIpInsteadOfUntrustedHeaders() throws Exception {
        when(protection.enabled()).thenReturn(true);
        when(protection.clientAddress(any())).thenReturn("192.0.2.7");
        var request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.addHeader("X-Real-IP", "198.51.100.7");
        filter.doFilter(request, new MockHttpServletResponse(), (incoming, response) ->
                assertThat(kr.it.reserve.global.ratelimit.IpExtractor.extract((jakarta.servlet.http.HttpServletRequest) incoming)).isEqualTo("192.0.2.7"));
    }
    @Test void onlyCredentialRejectionsAndTheirThrottlingCountAsAttackSignals() throws Exception {
        when(protection.enabled()).thenReturn(true);
        for (String path : new String[]{"/api/auth/login", "/api/v1/auth/mfa/verify"}) {
            var response = new MockHttpServletResponse();
            int status = path.endsWith("login") ? 401 : 400;
            filter.doFilter(new MockHttpServletRequest("POST", path), response, (request, reply) -> response.setStatus(status));
        }
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/updates/events"), response, (request, reply) -> response.setStatus(401));
        filter.doFilter(new MockHttpServletRequest("POST", "/api/auth/mfa/status"), new MockHttpServletResponse(), (request, reply) -> ((jakarta.servlet.http.HttpServletResponse) reply).setStatus(401));
        verify(protection, times(2)).failed(any());
    }
}
