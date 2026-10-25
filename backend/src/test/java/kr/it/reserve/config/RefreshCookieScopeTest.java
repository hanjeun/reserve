package kr.it.reserve.config;

import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.controller.AuthApiController;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockCookie;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RefreshCookieScopeTest {
    @Test void bothApiAliasesReceiveTheSameNarrowCookieAndTheLegacyWideCookieIsOnlyDeleted() {
        var response = new MockHttpServletResponse();
        new CookieUtil("prod").addCookie(response, "refresh_token", "synthetic-refresh", 60);
        var cookies = response.getHeaders(HttpHeaders.SET_COOKIE).stream().map(MockCookie::parse).toList();
        assertThat(cookies).extracting(MockCookie::getPath, MockCookie::getValue, MockCookie::getMaxAge)
                .containsExactly(tuple("/", "", 0), tuple("/api/auth", "synthetic-refresh", 60),
                        tuple("/api/v1/auth", "synthetic-refresh", 60));
        assertThat(cookies).allSatisfy(cookie -> {
            assertThat(cookie.getName()).isEqualTo("refresh_token");
            assertThat(cookie.getDomain()).isNull();
            assertThat(cookie.isHttpOnly()).isTrue();
            assertThat(cookie.getSecure()).isTrue();
            assertThat(cookie.getSameSite()).isEqualTo("Lax");
        });
        var deleted = new MockHttpServletResponse();
        new CookieUtil("prod").deleteCookie(deleted, "refresh_token");
        var deletions = deleted.getHeaders(HttpHeaders.SET_COOKIE).stream().map(MockCookie::parse).toList();
        assertThat(deletions).extracting(MockCookie::getPath).containsExactly("/api/auth", "/api/v1/auth", "/");
        assertThat(deletions).allSatisfy(cookie -> {
            assertThat(cookie.getName()).isEqualTo("refresh_token");
            assertThat(cookie.getValue()).isEmpty();
            assertThat(cookie.getMaxAge()).isZero();
            assertThat(cookie.getDomain()).isNull();
            assertThat(cookie.isHttpOnly()).isTrue();
            assertThat(cookie.getSecure()).isTrue();
            assertThat(cookie.getSameSite()).isEqualTo("Lax");
        });
    }
    @Test void distinctDuplicateRefreshCookiesFailClosedAndAreClearedWithoutUsingEitherValue() {
        TokenService service = mock(TokenService.class);
        var controller = new AuthApiController(mock(MemberService.class), mock(TokenProvider.class), mock(PasswordEncoder.class),
                new JwtProperties(), service, mock(RateLimiter.class), new CookieUtil("prod"));
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("refresh_token", "old-wide-value"), new Cookie("refresh_token", "new-narrow-value"));
        var response = new MockHttpServletResponse();
        assertThatThrownBy(() -> controller.refresh(request, response)).isInstanceOf(AuthException.class);
        verifyNoInteractions(service);
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).hasSize(4)
                .allSatisfy(cookie -> assertThat(cookie).contains("Max-Age=0").doesNotContain("old-wide-value", "new-narrow-value"));
    }
    @Test void identicalDuplicateValuesAreUnambiguousAndLogoutRevokesEveryDistinctPresentedFamily() {
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("refresh_token", "same"), new Cookie("refresh_token", "same"));
        assertThat(CookieUtil.getCookie(request, "refresh_token")).isEqualTo("same");
        TokenService service = mock(TokenService.class);
        var controller = new AuthApiController(mock(MemberService.class), mock(TokenProvider.class), mock(PasswordEncoder.class),
                new JwtProperties(), service, mock(RateLimiter.class), new CookieUtil("prod"));
        request.setCookies(new Cookie("refresh_token", "one"), new Cookie("refresh_token", "two"));
        controller.logout(request, new MockHttpServletResponse());
        verify(service).revoke("one");
        verify(service).revoke("two");
    }
}
