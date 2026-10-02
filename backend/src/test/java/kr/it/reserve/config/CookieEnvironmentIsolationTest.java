package kr.it.reserve.config;

import kr.it.reserve.config.util.CookieUtil;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class CookieEnvironmentIsolationTest {
    @Test
    void localInitializationCannotDisableProductionCookieSecurity() {
        CookieUtil production = new CookieUtil("prod");
        CookieUtil local = new CookieUtil("local");
        MockHttpServletResponse productionResponse = new MockHttpServletResponse();
        MockHttpServletResponse localResponse = new MockHttpServletResponse();

        production.addCookie(productionResponse, "session", "value", 60);
        production.deleteCookie(productionResponse, "session");
        local.addCookie(localResponse, "session", "value", 60);
        local.deleteCookie(localResponse, "session");

        assertThat(productionResponse.getHeaders(HttpHeaders.SET_COOKIE)).hasSize(2)
                .allSatisfy(cookie -> assertThat(cookie).contains("Secure", "HttpOnly", "SameSite=Lax", "Path=/"));
        assertThat(localResponse.getHeaders(HttpHeaders.SET_COOKIE)).hasSize(2)
                .allSatisfy(cookie -> assertThat(cookie).contains("HttpOnly", "SameSite=Lax", "Path=/")
                        .doesNotContain("Secure"));
    }

    @Test
    void productionInitializationCannotChangeLocalCookiePolicy() {
        CookieUtil local = new CookieUtil("local");
        CookieUtil production = new CookieUtil("prod");
        MockHttpServletResponse localResponse = new MockHttpServletResponse();
        MockHttpServletResponse productionResponse = new MockHttpServletResponse();

        local.addCookie(localResponse, "session", "local-value", 60);
        production.addCookie(productionResponse, "session", "production-value", 60);

        assertThat(localResponse.getHeader(HttpHeaders.SET_COOKIE))
                .startsWith("session=local-value;").contains("Max-Age=60").doesNotContain("Secure");
        assertThat(productionResponse.getHeader(HttpHeaders.SET_COOKIE))
                .startsWith("session=production-value;").contains("Max-Age=60", "Secure");
    }

    @Test
    void everyNonLocalEnvironmentKeepsSecureCookies() {
        for (String environment : new String[] { "prod", "test", "", null }) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            new CookieUtil(environment).addCookie(response, "session", "value", 60);
            assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).contains("Secure", "HttpOnly", "SameSite=Lax");
        }
    }
}
