package kr.it.reserve.feed.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.feed.service.FeedModerationService;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static kr.it.reserve.global.ratelimit.RateLimiter.Policy.PROFILE_READ;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FeedProfileReadRateLimitTest {
    private final FeedService feeds = mock(FeedService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final FeedController controller = new FeedController(feeds, mock(FeedMediaService.class),
            mock(FeedModerationService.class), limiter);

    @Test
    void anonymousProfileAndPostsShareTheIpQuotaAcrossAuthors() {
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::isLoggedIn).thenReturn(false);
            when(limiter.tryConsume("feed-profile-read-ip:203.0.113.9", PROFILE_READ))
                    .thenReturn(true, false, false);

            controller.author("first-author", request("203.0.113.9"));

            assertLimited(() -> controller.authorPosts("second-author", 0, 12, request("203.0.113.9")));
            assertLimited(() -> controller.author("third-author", request("203.0.113.9")));
            verify(feeds).publicProfile("first-author");
            verify(feeds, never()).publicProfile("third-author");
            verify(feeds, never()).authorPosts("second-author", 0, 12, null);
            verify(limiter, times(3)).tryConsume("feed-profile-read-ip:203.0.113.9", PROFILE_READ);
            security.verify(SecurityUtil::getCurrentMemberId, never());
        }
    }

    @Test
    void changingIpOrAuthorDoesNotResetTheAuthenticatedMemberQuota() {
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::isLoggedIn).thenReturn(true);
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(7L);
            when(limiter.tryConsume(anyString(), eq(PROFILE_READ))).thenReturn(true);
            when(limiter.tryConsume("feed-profile-read-member:7", PROFILE_READ)).thenReturn(true, false);

            controller.author("first-author", request("203.0.113.9"));
            assertLimited(() -> controller.authorPosts("second-author", 0, 12, request("198.51.100.7")));

            verify(limiter).tryConsume("feed-profile-read-ip:198.51.100.7", PROFILE_READ);
            verify(limiter, times(2)).tryConsume("feed-profile-read-member:7", PROFILE_READ);
            verify(feeds, never()).authorPosts("second-author", 0, 12, 7L);
        }
    }

    @Test
    void anExhaustedIpStopsSignedInReadsBeforeTheMemberQuotaAndDatabase() {
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::isLoggedIn).thenReturn(true);
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(7L);

            assertLimited(() -> controller.author("author", request("203.0.113.9")));

            verify(limiter, never()).tryConsume("feed-profile-read-member:7", PROFILE_READ);
            verify(feeds, never()).publicProfile("author");
        }
    }

    @Test
    void allowedReadsKeepAnonymousAccessAndTheAuthenticatedViewer() {
        try (var security = mockStatic(SecurityUtil.class)) {
            when(limiter.tryConsume(anyString(), eq(PROFILE_READ))).thenReturn(true);
            security.when(SecurityUtil::isLoggedIn).thenReturn(false);

            var anonymous = controller.authorPosts("author", 0, 12, request("203.0.113.9"));
            assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(anonymous.getHeaders().getCacheControl()).isEqualTo("no-store");
            verify(feeds).authorPosts("author", 0, 12, null);

            security.when(SecurityUtil::isLoggedIn).thenReturn(true);
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(7L);
            controller.authorPosts("author", 1, 12, request("203.0.113.9"));
            verify(feeds).authorPosts("author", 1, 12, 7L);
            verify(limiter).tryConsume("feed-profile-read-member:7", PROFILE_READ);
        }
    }

    private static void assertLimited(Runnable read) {
        assertThatThrownBy(read::run).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    private static MockHttpServletRequest request(String ip) {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr(ip);
        return request;
    }
}
