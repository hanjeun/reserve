package kr.it.reserve.config;

import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.controller.AuthApiController;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.service.RefreshRejectedException;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AuthRefreshCookieContractTest {

    @Mock private MemberService memberService;
    @Mock private TokenProvider tokenProvider;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private TokenService tokenService;
    @Mock private RateLimiter rateLimiter;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        JwtProperties.TokenConfig access = new JwtProperties.TokenConfig();
        access.setExpirationMinutes(30);
        properties.setAccessToken(access);
        new CookieUtil().setServerEnv("prod");

        AuthApiController controller = new AuthApiController(
                memberService, tokenProvider, passwordEncoder, properties, tokenService, rateLimiter);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void refreshRotatesBothHttpOnlyCookiesAndReturnsNoTokenJson() throws Exception {
        when(tokenService.refresh("refresh-value")).thenReturn(
                new TokenService.RefreshResult("new-access-value", "new-refresh-value", Duration.ofDays(14)));

        var result = mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refresh_token", "refresh-value")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andReturn();
        String body = result.getResponse().getContentAsString();
        List<String> setCookies = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE);

        assertThat(body).doesNotContain("new-access-value", "new-refresh-value", "accessToken", "refreshToken");
        assertThat(setCookies).hasSize(2);
        assertThat(setCookies).anySatisfy(cookie -> assertThat(cookie)
                .startsWith("access_token=new-access-value;")
                .contains("Path=/", "Max-Age=1800", "HttpOnly", "Secure", "SameSite=Lax"));
        // refresh 쿠키도 매번 다시 심어야 브라우저 쪽 만료(Max-Age)가 사용 시점부터 다시 14일이 된다.
        assertThat(setCookies).anySatisfy(cookie -> assertThat(cookie)
                .startsWith("refresh_token=new-refresh-value;")
                .contains("Path=/", "Max-Age=1209600", "HttpOnly", "Secure", "SameSite=Lax"));
        verify(tokenService).refresh("refresh-value");
    }

    @Test
    void refreshWithoutCookieIs401AndNeverTouchesTheTokenStore() throws Exception {
        when(tokenService.rejectMissingCookie()).thenReturn(new RefreshRejectedException(
                RefreshRejectedException.Reason.MISSING_COOKIE, "로그인이 만료되었습니다. 다시 로그인해주세요."));

        var result = mockMvc.perform(post("/api/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andReturn();

        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
        verify(tokenService, never()).refresh(anyString());
    }

    @Test
    void rejectedRefreshSetsNoCookies() throws Exception {
        when(tokenService.refresh("stale-value")).thenThrow(new RefreshRejectedException(
                RefreshRejectedException.Reason.REUSED_TOKEN, "로그인이 만료되었습니다. 다시 로그인해주세요."));

        var result = mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refresh_token", "stale-value")))
                .andExpect(status().isUnauthorized())
                .andReturn();

        // 응답 문구는 사유와 무관하게 하나다(사유는 서버 로그에만).
        assertThat(result.getResponse().getContentAsString()).doesNotContain("REUSED", "stale-value");
        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
    }

    @Test
    void logoutRevokesThePresentedDeviceAndClearsBothCookies() throws Exception {
        var result = mockMvc.perform(post("/api/auth/logout")
                        .cookie(new Cookie("refresh_token", "refresh-value")))
                .andExpect(status().isOk())
                .andReturn();

        verify(tokenService).revoke("refresh-value");
        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
                .anySatisfy(cookie -> assertThat(cookie).startsWith("access_token=;").contains("Max-Age=0"))
                .anySatisfy(cookie -> assertThat(cookie).startsWith("refresh_token=;").contains("Max-Age=0"));
    }
}
