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
    void anonymousEntryCookiesAlsoRequireBrowserOriginProofForWrites() {
        for (String name : List.of("reserve_entry", "__Host-reserve-entry")) {
            var request = new MockHttpServletRequest("DELETE", "/api/service-admission");
            request.setServletPath("/api/service-admission");
            request.setCookies(new Cookie(name, "synthetic-entry"));
            assertThat(matcher.matches(request)).isTrue();
            request.addHeader("Origin", "https://untrusted.example");
            assertThat(matcher.matches(request)).isTrue();
            request.removeHeader("Origin");
            request.addHeader("Origin", "https://reserve.it.kr");
            assertThat(matcher.matches(request)).isFalse();
            request.setMethod("GET");
            assertThat(matcher.matches(request)).isFalse();
        }
    }

    @Test
    void intermediateAuthenticationCookiesRequireOriginProofBeforeApplicationTokensExist() {
        for (String name : List.of("mfa_ticket", "JSESSIONID")) {
            var request = new MockHttpServletRequest("POST", "/api/auth/mfa/cancel");
            request.setServletPath("/api/auth/mfa/cancel");
            request.setCookies(new Cookie(name, "synthetic-authentication"));
            assertThat(matcher.matches(request)).isTrue();
            request.addHeader("Referer", "https://untrusted.example/");
            assertThat(matcher.matches(request)).isTrue();
            request.removeHeader("Referer");
            request.addHeader("Origin", "https://reserve.it.kr");
            assertThat(matcher.matches(request)).isFalse();
        }
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
    void onlySafeReadsAndExplicitSignedCollectorsAreExempt() {
        var read = write();
        read.setMethod("GET");
        assertThat(matcher.matches(read)).isFalse();
        for (String path : List.of("/api/payment/webhook/portone", "/api/csp-reports",
                "/api/oauth/events/google", "/api/oauth/events/kakao", "/api/oauth/events/naver",
                "/api/v1/oauth/events/google", "/api/v1/oauth/events/kakao", "/api/v1/oauth/events/naver")) {
            var collector = write();
            collector.setServletPath(path);
            assertThat(matcher.matches(collector)).isFalse();
            collector.setMethod("PUT");
            assertThat(matcher.matches(collector)).isTrue();
        }
        for (String path : List.of("/api/oauth/events/apple", "/api/oauth/events/naver/extra", "/api/oauth/events/google/extra",
                "/api/v1/oauth/events/kakao/extra")) {
            var other = write();
            other.setServletPath(path);
            assertThat(matcher.matches(other)).isTrue();
        }
    }
}
