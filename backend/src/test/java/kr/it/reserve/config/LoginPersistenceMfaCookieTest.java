package kr.it.reserve.config;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.mfa.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LoginPersistenceMfaCookieTest {

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void enrollmentDeferralUsesTheSignedSessionChoiceAndClearsTheTicket(boolean persistent) throws Exception {
        SecurityContextHolder.clearContext();
        var service = mock(MfaService.class); var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        String raw = "B".repeat(43) + (persistent ? ".1" : ".0");
        when(service.deferEnrollment(raw, null, null)).thenReturn(new MfaService.Completion(
                new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(14), persistent)));
        var mvc = MockMvcBuilders.standaloneSetup(new MfaController(service, new CookieUtil("prod"), JwtSessionFixture.properties(), limiter))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        var response = mvc.perform(post("/api/auth/mfa/defer").cookie(new jakarta.servlet.http.Cookie("mfa_ticket", raw))
                        .contentType("application/json").content("{\"rememberMe\":" + !persistent + "}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        var credentials = response.getHeaders("Set-Cookie").stream().filter(value ->
                value.startsWith("access_token=synthetic-access;") || value.startsWith("refresh_token=synthetic-refresh;")).toList();
        assertThat(credentials).hasSize(3).allSatisfy(value -> assertThat(value).contains("HttpOnly", "Secure", "SameSite=Lax"));
        for (String value : credentials) {
            if (persistent) assertThat(value).contains("Max-Age=");
            else assertThat(value).doesNotContain("Max-Age=", "Expires=");
        }
        assertThat(response.getHeaders("Set-Cookie")).anySatisfy(value -> assertThat(value).startsWith("mfa_ticket=;").contains("Max-Age=0"));
        assertThat(response.getContentAsString()).doesNotContain(raw, "synthetic-access", "synthetic-refresh");
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void passkeyEntryAndMfaCompletionUseTheOriginalChoice(boolean persistent) throws Exception {
        SecurityContextHolder.clearContext();
        var service = mock(MfaService.class);
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        String raw = "A".repeat(43) + (persistent ? ".1" : ".0");
        when(service.beginPasskeyLogin(persistent)).thenReturn(new MfaService.Ticket(raw));
        when(service.status(raw, null, null)).thenReturn(new MfaService.View(true, false, false, true, false, "PASSKEY_LOGIN", LocalDateTime.now().plusMinutes(5), false));
        when(service.finish(raw, null, null)).thenReturn(new MfaService.Completion(
                new TokenProvider.IssuedSession("synthetic-access", "synthetic-refresh", Duration.ofDays(14), persistent)));
        var jwt = JwtSessionFixture.properties();
        var mvc = MockMvcBuilders.standaloneSetup(new MfaController(service, new CookieUtil("prod"), jwt, limiter))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        var start = mvc.perform(post("/api/auth/mfa/passkey/login").contentType("application/json")
                        .content("{\"rememberMe\":" + persistent + "}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        String ticketCookie = start.getHeaders("Set-Cookie").stream().filter(value -> value.startsWith("mfa_ticket=")).findFirst().orElseThrow();
        if (persistent) assertThat(ticketCookie).contains("Max-Age=300");
        else assertThat(ticketCookie).doesNotContain("Max-Age=", "Expires=");
        assertThat(start.getContentAsString()).doesNotContain(raw);
        var done = mvc.perform(post("/api/auth/mfa/finish").cookie(new jakarta.servlet.http.Cookie("mfa_ticket", raw))
                        .contentType("application/json").content("{\"rememberMe\":" + !persistent + "}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        var credentials = done.getHeaders("Set-Cookie").stream().filter(value ->
                value.startsWith("access_token=synthetic-access;") || value.startsWith("refresh_token=synthetic-refresh;")).toList();
        assertThat(credentials).hasSize(3).allSatisfy(value -> assertThat(value).contains("HttpOnly", "Secure", "SameSite=Lax"));
        for (String value : credentials) {
            if (persistent) assertThat(value).contains("Max-Age=");
            else assertThat(value).doesNotContain("Max-Age=", "Expires=");
        }
        assertThat(done.getContentAsString()).doesNotContain("synthetic-access", "synthetic-refresh");
        verify(service).beginPasskeyLogin(persistent);
    }
}
