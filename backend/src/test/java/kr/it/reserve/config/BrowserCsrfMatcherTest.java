package kr.it.reserve.config;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserCsrfMatcherTest {
    private final BrowserCsrfMatcher matcher = new BrowserCsrfMatcher(List.of("https://reserve.it.kr"));

    private MockHttpServletRequest write() {
        var request = new MockHttpServletRequest("POST", "/api/member/profile");
        request.setServletPath("/api/member/profile");
        request.setCookies(new Cookie("access_token", "synthetic"));
        return request;
    }

    @Test
    void browserWritesNeedAnExactTrustedOrigin() {
        var request = write();
        for (String origin : List.of("null", "http://reserve.it.kr", "https://reserve.it.kr.evil.example")) {
            request.removeHeader("Origin");
            request.addHeader("Origin", origin);
            assertThat(matcher.matches(request)).isTrue();
        }
        request.removeHeader("Origin");
        request.addHeader("Origin", "https://reserve.it.kr");
        assertThat(matcher.matches(request)).isFalse();
    }

    @Test
    void refererFallbackChecksTheAuthorityRatherThanAStringPrefix() {
        var request = write();
        for (String referer : List.of("https://reserve.it.kr@evil.example/", "https://reserve.it.kr.evil.example/", "bad uri")) {
            request.removeHeader("Referer");
            request.addHeader("Referer", referer);
            assertThat(matcher.matches(request)).isTrue();
        }
        request.removeHeader("Referer");
        request.addHeader("Referer", "https://reserve.it.kr/store/81");
        assertThat(matcher.matches(request)).isFalse();
    }

    @Test
    void fetchMetadataFallbackRejectsOtherSitesAndMissingCookieProof() {
        var request = write();
        assertThat(matcher.matches(request)).isTrue();
        request.addHeader("Sec-Fetch-Site", "cross-site");
        assertThat(matcher.matches(request)).isTrue();
        request.removeHeader("Sec-Fetch-Site");
        request.addHeader("Sec-Fetch-Site", "same-origin");
        assertThat(matcher.matches(request)).isFalse();
        var serverCall = new MockHttpServletRequest("POST", "/api/member/profile");
        assertThat(matcher.matches(serverCall)).isFalse();
    }

    @Test
    void onlySafeReadsAndTheTwoExplicitExternalCollectorsAreExempt() {
        var read = write();
        read.setMethod("GET");
        assertThat(matcher.matches(read)).isFalse();
        for (String path : List.of("/api/payment/webhook/portone", "/api/csp-reports")) {
            var collector = write();
            collector.setServletPath(path);
            assertThat(matcher.matches(collector)).isFalse();
            collector.setMethod("PUT");
            assertThat(matcher.matches(collector)).isTrue();
        }
    }
}
