package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

import static org.assertj.core.api.Assertions.assertThat;

class OAuthStartRateLimitFilterTest {
    @Test void sharedAuthenticationOutageIs503BeforeAnySessionOrProviderRequest() throws Exception {
        var limiter = org.mockito.Mockito.mock(RateLimiter.class);
        org.mockito.Mockito.when(limiter.tryConsume(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new kr.it.reserve.global.ratelimit.RedisAuthRateLimiter.Unavailable(10));
        var request = start("GET");
        var response = new MockHttpServletResponse();
        new OAuthStartRateLimitFilter(limiter, new ObjectMapper().findAndRegisterModules()).doFilter(request, response, (req, res) -> request.getSession());
        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getHeader("Retry-After")).isEqualTo("10");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(request.getSession(false)).isNull();
    }
    @Test void repeatedAnonymousStartsStopBeforeAnyNewHttpSessionIsCreated() throws Exception {
        var filter = new OAuthStartRateLimitFilter(new RateLimiter(), new ObjectMapper().findAndRegisterModules());
        for (int i = 0; i <= RateLimiter.Policy.OAUTH_START.capacity(); i++) {
            var request = start("GET");
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> request.getSession());
            if (i < RateLimiter.Policy.OAUTH_START.capacity()) assertThat(request.getSession(false)).isNotNull();
            else {
                assertThat(response.getStatus()).isEqualTo(429);
                assertThat(response.getHeader("Retry-After")).isEqualTo("60");
                assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
                assertThat(request.getSession(false)).isNull();
            }
        }
    }

    @Test void missingLimiterAndWrongMethodCannotCreateSessions() throws Exception {
        for (String method : new String[]{"GET", "POST"}) {
            var request = start(method);
            var response = new MockHttpServletResponse();
            new OAuthStartRateLimitFilter(null, new ObjectMapper().findAndRegisterModules()).doFilter(request, response, (req, res) -> request.getSession());
            assertThat(response.getStatus()).isEqualTo("GET".equals(method) ? 503 : 405);
            assertThat(request.getSession(false)).isNull();
        }
    }

    @Test void callbackAndApiRequestsDoNotConsumeTheStartLimit() throws Exception {
        var filter = new OAuthStartRateLimitFilter(null, new ObjectMapper());
        for (String path : new String[]{"/login/oauth2/code/google", "/api/member/me", "/hc"}) {
            var request = new MockHttpServletRequest("GET", path);
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> response.setStatus(204));
            assertThat(response.getStatus()).isEqualTo(204);
        }
    }

    private MockHttpServletRequest start(String method) { return new MockHttpServletRequest(method, "/oauth2/authorization/google"); }
}
