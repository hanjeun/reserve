package kr.it.reserve.member.mfa;

import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MfaRecoveryCookieTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managedEnrollmentRenewsCookiesBeforeRecoveryAcknowledgementWithoutReturningTokens(boolean persistent) {
        for (boolean passkey : new boolean[]{false, true}) {
            var service = mock(MfaService.class);
            var properties = mock(JwtProperties.class);
            when(properties.getAccessTokenExpiration()).thenReturn(Duration.ofMinutes(15));
            var limiter = mock(RateLimiter.class);
            when(limiter.tryConsume(anyString(), any())).thenReturn(true);
            var session = new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(1), persistent);
            var enrollment = new MfaService.Enrollment(List.of("synthetic-recovery"), session);
            when(service.confirmTotp(any(), any(), any(), any())).thenReturn(enrollment);
            when(service.confirmPasskey(any(), any(), any(), any(), any())).thenReturn(enrollment);
            var response = new MockHttpServletResponse();
            var controller = new MfaController(service, new CookieUtil("local"), properties, limiter);
            var result = passkey
                    ? controller.confirmPasskey(new MockHttpServletRequest(), response, null, new MfaController.Registration("synthetic-proof", "패스키"))
                    : controller.confirmTotp(new MockHttpServletRequest(), response, null, new MfaController.Code("123456"));
            assertThat(result.getData()).isEqualTo(new MfaController.Recovery(List.of("synthetic-recovery")));
            assertThat(enrollment.toString()).isEqualTo("Enrollment[redacted]");
            var headers = response.getHeaders("Set-Cookie");
            var auth = headers.stream().filter(value -> value.startsWith("access_token=synthetic-access") || value.startsWith("refresh_token=synthetic-refresh")).toList();
            assertThat(auth).hasSize(3).allMatch(value -> value.contains("HttpOnly"));
            assertThat(auth).anyMatch(value -> value.startsWith("access_token=synthetic-access"))
                    .anyMatch(value -> value.startsWith("refresh_token=synthetic-refresh"));
            assertThat(auth.stream().allMatch(value -> value.contains("Max-Age="))).isEqualTo(persistent);
            assertThat(headers).anyMatch(value -> value.startsWith("refresh_token=;") && value.contains("Path=/;") && value.contains("Max-Age=0"));
            assertThat(headers).noneMatch(value -> value.startsWith("mfa_ticket="));
            verify(service, never()).finish(any(), any(), any());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"passkey", "totp"})
    void unauthenticatedEnrollmentKeepsTheFinishBoundary(String kind) {
        var service = mock(MfaService.class);
        var enrollment = new MfaService.Enrollment(List.of("synthetic-recovery"), null);
        when(service.confirmTotp(any(), any(), any(), any())).thenReturn(enrollment);
        when(service.confirmPasskey(any(), any(), any(), any(), any())).thenReturn(enrollment);
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var response = new MockHttpServletResponse();
        var controller = new MfaController(service, new CookieUtil("local"), mock(JwtProperties.class), limiter);
        if ("passkey".equals(kind)) controller.confirmPasskey(new MockHttpServletRequest(), response, null, new MfaController.Registration("synthetic-proof", "패스키"));
        else controller.confirmTotp(new MockHttpServletRequest(), response, null, new MfaController.Code("123456"));
        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void disablingOptionalFactorsReturnsOnlyTheSessionRenewalFlag(boolean persistent) {
        var service = mock(MfaService.class);
        var properties = mock(JwtProperties.class);
        when(properties.getAccessTokenExpiration()).thenReturn(Duration.ofMinutes(15));
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var session = new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(1), persistent);
        when(service.disable(any(), any(), any(), eq(true))).thenReturn(new MfaService.Completion(session));
        var response = new MockHttpServletResponse();
        var result = new MfaController(service, new CookieUtil("local"), properties, limiter)
                .disable(new MockHttpServletRequest(), response, null, new MfaController.Disable(true));
        assertThat(result.getData()).isEqualTo(new MfaController.CredentialRemoval(true));
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(value -> value.startsWith("access_token=synthetic-access"))
                .anyMatch(value -> value.startsWith("refresh_token=synthetic-refresh"));
    }

    @Test
    void legacyDisableWithoutContinuationDoesNotLeaveRenewedAuthenticationCookies() {
        var service = mock(MfaService.class);
        when(service.disable(any(), any(), any(), eq(false))).thenReturn(new MfaService.Completion(null));
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var response = new MockHttpServletResponse();
        var result = new MfaController(service, new CookieUtil("local"), mock(JwtProperties.class), limiter)
                .disable(new MockHttpServletRequest(), response, null, null);
        assertThat(result.getData()).isEqualTo(new MfaController.CredentialRemoval(false));
        assertThat(response.getHeaders("Set-Cookie")).noneMatch(value -> value.startsWith("access_token=") || value.startsWith("refresh_token="));
        verify(service).disable(any(), any(), any(), eq(false));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void removingOneCredentialReplacesCookiesWithoutReturningTokens(boolean persistent) {
        SecurityContextHolder.clearContext();
        var service = mock(MfaService.class);
        var properties = mock(JwtProperties.class);
        when(properties.getAccessTokenExpiration()).thenReturn(Duration.ofMinutes(15));
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var session = new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(1), persistent);
        when(service.remove(any(), any(), any(), eq("synthetic-credential"))).thenReturn(new MfaService.Completion(session));
        var response = new MockHttpServletResponse();
        var result = new MfaController(service, new CookieUtil("local"), properties, limiter)
                .remove(new MockHttpServletRequest(), response, null, new MfaController.Removal("synthetic-credential"));
        assertThat(result.getData()).isEqualTo(new MfaController.CredentialRemoval(true));
        var auth = response.getHeaders("Set-Cookie").stream().filter(value -> value.startsWith("access_token=synthetic-access") || value.startsWith("refresh_token=synthetic-refresh")).toList();
        assertThat(auth).hasSize(3);
        assertThat(auth).anyMatch(value -> value.startsWith("access_token=synthetic-access"))
                .anyMatch(value -> value.startsWith("refresh_token=synthetic-refresh"));
        assertThat(auth).anyMatch(value -> value.contains("Path=/api/auth;"))
                .anyMatch(value -> value.contains("Path=/api/v1/auth;"));
        assertThat(auth.stream().allMatch(value -> value.contains("Max-Age="))).isEqualTo(persistent);
        verify(service, never()).finish(any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managementRecoveryProofReplacesCookiesAndReturnsOnlyTheView(boolean persistent) {
        SecurityContextHolder.clearContext();
        var service = mock(MfaService.class);
        var properties = mock(JwtProperties.class);
        when(properties.getAccessTokenExpiration()).thenReturn(Duration.ofMinutes(15));
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        var member = Member.builder().id(7L).build();
        var view = new MfaService.View(true, false, true, true, false, "MANAGE", null, false);
        var session = new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(1), persistent);
        when(service.verify(isNull(), eq(member), isNull(), eq("BACKUP"), eq("synthetic-code")))
                .thenReturn(new MfaService.Verification(view, session));

        var result = new MfaController(service, new CookieUtil("local"), properties, limiter)
                .verify(request, response, member, new MfaController.Proof("BACKUP", "synthetic-code"));

        assertThat(result.getData()).isSameAs(view);
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(value -> value.startsWith("access_token=synthetic-access"))
                .anyMatch(value -> value.startsWith("refresh_token=synthetic-refresh"));
        assertThat(response.getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith("access_token=synthetic-access") || value.startsWith("refresh_token=synthetic-refresh"))
                .allMatch(value -> value.contains("Max-Age="))).isEqualTo(persistent);
        verify(service, never()).finish(any(), any(), any());
    }

    @Test
    void ordinaryProofKeepsTheExistingCookiesAndFinishBoundary() {
        var service = mock(MfaService.class);
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var view = new MfaService.View(true, false, true, false, true, "LOGIN", null, false);
        when(service.verify(any(), any(), any(), any(), any())).thenReturn(new MfaService.Verification(view, null));
        var response = new MockHttpServletResponse();

        var result = new MfaController(service, new CookieUtil("local"), mock(JwtProperties.class), limiter)
                .verify(new MockHttpServletRequest(), response, null, new MfaController.Proof("TOTP", "123456"));

        assertThat(result.getData()).isSameAs(view);
        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
        verify(service, never()).finish(any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void recoveryResponseReplacesBothCookiesWithoutWaitingForTheCodesPanel(boolean persistent) {
        SecurityContextHolder.clearContext();
        var service = mock(MfaService.class);
        var properties = mock(JwtProperties.class);
        when(properties.getAccessTokenExpiration()).thenReturn(Duration.ofMinutes(15));
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var member = Member.builder().id(7L).build();
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("mfa_ticket", "A".repeat(43) + ".0"));
        var response = new MockHttpServletResponse();
        var session = new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(1), persistent);
        when(service.regenerateRecovery(anyString(), eq(member), isNull()))
                .thenReturn(new MfaService.RecoveryRenewal(List.of("synthetic-recovery"), session));

        var result = new MfaController(service, new CookieUtil("local"), properties, limiter).recovery(request, response, member);

        assertThat(result.getData().codes()).containsExactly("synthetic-recovery");
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(value -> value.contains("access_token=synthetic-access"))
                .anyMatch(value -> value.contains("refresh_token=synthetic-refresh"));
        assertThat(response.getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith("access_token=synthetic-access") || value.startsWith("refresh_token=synthetic-refresh"))
                .anyMatch(value -> value.contains("Max-Age="))).isEqualTo(persistent);
        verify(service, never()).finish(any(), any(), any());
    }
}
