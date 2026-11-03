package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;
import java.io.IOException;
import java.util.Set;

final class IpProtectionFilter extends OncePerRequestFilter {
    private static final Set<String> EXEMPT = Set.of("/api/auth/logout", "/api/auth/refresh", "/api/auth/session",
            "/api/auth/mfa/cancel", "/api/payment/webhook/portone", "/api/csp-reports",
            "/api/oauth/events/google", "/api/oauth/events/kakao", "/api/oauth/events/naver");
    private static final Set<String> PROOFS = Set.of("/api/auth/mfa/verify", "/api/auth/mfa/totp/confirm",
            "/api/auth/mfa/passkey/confirm", "/api/auth/mfa/email/send");
    private final IpLoginProtection protection;
    private final ObjectMapper mapper;

    IpProtectionFilter(IpLoginProtection protection, ObjectMapper mapper) { this.protection = protection; this.mapper = mapper; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        if (path.startsWith("/api/v1/")) path = "/api" + path.substring(7);
        boolean start = path.startsWith("/oauth2/authorization/");
        if (protection == null || !protection.enabled() || !start && !path.startsWith("/api/")) {
            chain.doFilter(request, response);
            return;
        }
        kr.it.reserve.global.ratelimit.IpExtractor.useVerifiedAddress(request, protection.clientAddress(request));
        // 공유 IP의 실패 이력이 기존 세션의 조회까지 차단하지 않게 해요.
        boolean authentication = start || path.startsWith("/api/auth/") || path.equals("/api/member/login-methods/confirm");
        if (EXEMPT.contains(path) || !authentication) { chain.doFilter(request, response); return; }
        long remaining = protection.blocked(request);
        if (remaining > 0) {
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf((remaining + 999) / 1000));
            response.setHeader("Cache-Control", "no-store");
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(mapper.writeValueAsString(ApiResponse.error("이 접속 환경의 요청이 일시적으로 제한됐어요. 잠시 후 다시 시도해주세요.")));
            return;
        }
        chain.doFilter(request, response);
        int status = response.getStatus();
        if ("POST".equals(request.getMethod()) && ("/api/auth/login".equals(path) && (status == 401 || status == 429)
                || PROOFS.contains(path) && (status == 400 || status == 429)) || start && status == 429) protection.failed(request);
    }
}
