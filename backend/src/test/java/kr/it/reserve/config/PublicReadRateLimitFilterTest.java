package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class PublicReadRateLimitFilterTest {
    private final RateLimiter limiter = new RateLimiter();
    private final PublicReadRateLimitFilter filter = new PublicReadRateLimitFilter(
            limiter, new ObjectMapper().findAndRegisterModules());

    @Test
    void aliasesAndPublicListsShareAnIpLimitWhileAvailabilityHasItsOwnBudget() throws Exception {
        for (int i = 0; i < 45; i++) {
            assertThat(status("GET", "/api/stores", "192.0.2.5")).isEqualTo(204);
            assertThat(status("GET", "/api/v1/feed/posts", "192.0.2.5")).isEqualTo(204);
        }

        assertThat(status("GET", "/api/v1/stores/regions", "192.0.2.5")).isEqualTo(429);
        assertThat(status("HEAD", "/api/stores", "192.0.2.5")).isEqualTo(429);
        assertThat(status("GET", "/api/stores", "192.0.2.6")).isEqualTo(204);
        assertThat(status("GET", "/api/reservations/calendar", "192.0.2.5")).isEqualTo(204);
        assertThat(status("GET", "/api/search", "192.0.2.5")).isEqualTo(204);
        assertThat(status("POST", "/api/stores", "192.0.2.5")).isEqualTo(204);
    }

    @Test
    void theReviewListAndStatsShareABudgetAcrossStoreIdsAndApiVersions() throws Exception {
        for (int i = 0; i < 30; i++) {
            assertThat(status("GET", "/api/reviews/store/7", "192.0.2.5")).isEqualTo(204);
            assertThat(status("GET", "/api/v1/reviews/store/8/stats", "192.0.2.5")).isEqualTo(204);
        }

        assertThat(status("HEAD", "/api/v1/reviews/store/9", "192.0.2.5")).isEqualTo(429);
        assertThat(status("GET", "/api/reviews/store/9", "192.0.2.6")).isEqualTo(204);
        assertThat(status("GET", "/api/stores", "192.0.2.5")).isEqualTo(204);
    }

    @Test
    void reviewPhotosReuseThePublicImageBudgetAcrossPhotoIdsAndApiVersions() throws Exception {
        for (int i = 0; i < 50; i++) {
            assertThat(status("GET", "/api/reviews/7/photos/" + i, "192.0.2.5")).isEqualTo(204);
            assertThat(status("GET", "/api/v1/reviews/8/photos/" + i, "192.0.2.5")).isEqualTo(204);
        }
        for (int i = 0; i < 20; i++) {
            assertThat(limiter.tryConsume("feed-image-read:192.0.2.5", RateLimiter.Policy.AD_METRIC)).isTrue();
        }

        assertThat(status("HEAD", "/api/v1/reviews/9/photos/99", "192.0.2.5")).isEqualTo(429);
        assertThat(status("GET", "/api/reviews/7/photos/1", "192.0.2.6")).isEqualTo(204);
        assertThat(status("GET", "/api/reviews/store/7", "192.0.2.5")).isEqualTo(204);
        assertThat(status("POST", "/api/reviews/7/photos/1", "192.0.2.5")).isEqualTo(204);
    }

    private int status(String method, String path, String ip) throws Exception {
        var request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr(ip);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (incoming, outgoing) -> response.setStatus(204));
        return response.getStatus();
    }
}
