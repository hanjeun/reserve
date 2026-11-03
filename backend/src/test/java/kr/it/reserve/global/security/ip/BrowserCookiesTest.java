package kr.it.reserve.global.security.ip;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.*;

class BrowserCookiesTest {
    @Test void productionCookieIsHostOnlySecureAndExplicitlyRevocable() {
        var cookies = new BrowserCookies("prod");
        var response = new MockHttpServletResponse();
        cookies.rememberBrowser(response, "a".repeat(43));
        assertThat(response.getHeader("Set-Cookie")).contains("__Host-reserve_browser=", "Path=/", "Max-Age=2592000", "Secure", "HttpOnly", "SameSite=Lax").doesNotContain("Domain=");
        var removed = new MockHttpServletResponse(); cookies.forgetBrowser(removed);
        assertThat(removed.getHeader("Set-Cookie")).contains("Max-Age=0");
        assertThatThrownBy(() -> cookies.rememberBrowser(response, "invalid; Domain=example.test")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void localCookieUsesItsOwnNameAndAmbiguousOrMalformedValuesNeverEstablishTrust() {
        var cookies = new BrowserCookies("local"); var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("reserve_browser", "a".repeat(43)));
        assertThat(cookies.browserCookie(request)).isEqualTo("a".repeat(43));
        request.setCookies(new Cookie("__Host-reserve_browser", "a".repeat(43)));
        assertThat(cookies.browserCookie(request)).isNull();
        request.setCookies(new Cookie("reserve_browser", "a".repeat(43)), new Cookie("reserve_browser", "a".repeat(43)));
        assertThat(cookies.browserCookie(request)).isNull();
        request.setCookies(new Cookie("reserve_browser", "malformed"));
        assertThat(cookies.browserCookie(request)).isNull();
        var response = new MockHttpServletResponse();cookies.rememberBrowser(response, "a".repeat(43));
        assertThat(response.getHeader("Set-Cookie")).startsWith("reserve_browser=").doesNotContain("Secure;", "Domain=");
    }
}
