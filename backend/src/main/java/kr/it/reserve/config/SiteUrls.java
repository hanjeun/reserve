package kr.it.reserve.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.Set;
import jakarta.servlet.http.HttpServletRequest;

/** 로그인·결제 복귀와 공개 주소의 설정 관문. 요청 Host를 복귀 주소로 신뢰하지 않는다. */
@Component("siteUrls")
public class SiteUrls {
    public static final String DEFAULT_APP_ORIGIN = "https://reserve.it.kr";
    private final String frontendOrigin;
    private final String appOrigin;
    private final String marketingOrigin;
    private final boolean localEnvironment;
    @Value("${app.legacy-frontend-url:}")
    private String legacyFrontend;

    public SiteUrls(@Value("${server.env:prod}") String environment,
                    @Value("${app.frontend-url:}") String frontend,
                    @Value("${app.public-url:}") String app,
                    @Value("${app.marketing-url:https://reserve.it.kr}") String marketing) {
        boolean local = "local".equals(environment);
        localEnvironment = local;
        frontendOrigin = origin(frontend.isBlank() ? (local ? "http://localhost:5173" : DEFAULT_APP_ORIGIN) : frontend, local);
        appOrigin = origin(app.isBlank() ? (frontend.isBlank() ? DEFAULT_APP_ORIGIN : frontend) : app, local);
        marketingOrigin = origin(marketing, local);
    }
    public String getFrontendOrigin() { return frontendOrigin; }
    public String getAppOrigin() { return appOrigin; }
    public String getMarketingOrigin() { return marketingOrigin; }
    public java.util.List<String> browserOrigins(java.util.List<String> configured) {
        var allowed = new java.util.LinkedHashSet<>(configured);
        allowed.add(frontendOrigin);
        if (legacyFrontend != null && !legacyFrontend.isBlank()) allowed.add(origin(legacyFrontend, false));
        return java.util.List.copyOf(allowed);
    }
    public java.util.List<String> oauthOrigins(java.util.List<String> configured) {
        var origins = new java.util.LinkedHashSet<String>();
        origins.add(frontendOrigin);
        if (legacyFrontend != null && !legacyFrontend.isBlank()) origins.add(origin(legacyFrontend, false));
        if (localEnvironment) { origins.add("http://localhost:8080"); for (String item : configured) origins.add(origin(item, true)); }
        return java.util.List.copyOf(origins);
    }
    public String frontendFor(HttpServletRequest request) {
        // Only the fixed legacy host can finish an in-flight OAuth on its own host-only cookie.
        if (legacyFrontend != null && !legacyFrontend.isBlank()) {
            String legacy = origin(legacyFrontend, false);
            if (URI.create(legacy).getHost().equalsIgnoreCase(request.getServerName())) return legacy;
        }
        return frontendOrigin;
    }
    public String frontendPath(String path) {
        if (path == null || !path.startsWith("/") || path.startsWith("//") || path.contains("\\") || path.chars().anyMatch(Character::isISOControl))
            throw new IllegalArgumentException("A relative application path is required");
        return frontendOrigin + path;
    }
    private static String origin(String value, boolean local) {
        URI uri = URI.create(value.strip());
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
        boolean secure = "https".equals(scheme);
        boolean loopback = local && "http".equals(scheme) && Set.of("localhost", "127.0.0.1", "[::1]").contains(host);
        if ((!secure && !loopback) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) throw new IllegalArgumentException("Site URL must be an HTTPS origin (loopback HTTP in local only)");
        int port = uri.getPort();
        if (port != -1 && (port < 1 || port > 65535)) throw new IllegalArgumentException("Invalid site port");
        return scheme + "://" + host + (port == -1 || secure && port == 443 || !secure && port == 80 ? "" : ":" + port);
    }
}
