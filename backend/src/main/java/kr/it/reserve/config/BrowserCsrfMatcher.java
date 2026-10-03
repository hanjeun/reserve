package kr.it.reserve.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.RequestMatcher;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

/** 브라우저의 상태 변경 요청은 허용 출처를 증명해야 한다. */
final class BrowserCsrfMatcher implements RequestMatcher {
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");
    private final Set<String> allowedOrigins;

    BrowserCsrfMatcher(List<String> allowedOrigins) {
        this.allowedOrigins = Set.copyOf(allowedOrigins);
    }

    @Override
    public boolean matches(HttpServletRequest request) {
        if (SAFE_METHODS.contains(request.getMethod())) return false;
        String path = request.getServletPath();
        if ("POST".equals(request.getMethod())
                && (ApiPaths.matchesAlias(path, "/api/payment/webhook/portone")
                || ApiPaths.matchesAlias(path, "/api/csp-reports"))) {
            return false;
        }
        String origin = request.getHeader("Origin");
        if (origin != null) return !allowedOrigins.contains(origin);
        String referer = request.getHeader("Referer");
        if (referer != null) return !hasAllowedReferer(referer);
        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (fetchSite != null) return !"same-origin".equals(fetchSite);
        Cookie[] cookies = request.getCookies();
        // 쿠키가 없는 서버 간 호출은 주변 브라우저 자격 증명을 사용할 수 없다.
        return cookies != null && Arrays.stream(cookies).anyMatch(cookie ->
                "access_token".equals(cookie.getName()) || "refresh_token".equals(cookie.getName()));
    }

    private boolean hasAllowedReferer(String referer) {
        try {
            URI uri = new URI(referer);
            return allowedOrigins.contains(uri.getScheme() + "://" + uri.getRawAuthority());
        } catch (URISyntaxException exception) {
            return false;
        }
    }
}
