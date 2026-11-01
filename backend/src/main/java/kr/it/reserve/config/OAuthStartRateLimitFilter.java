package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;

/** 공급자로 이동하기 전 제한해 미완료 OAuth 세션이 계속 생성되지 않게 한다. */
final class OAuthStartRateLimitFilter extends OncePerRequestFilter {
    private final RateLimiter limiter;
    private final ObjectMapper mapper;

    OAuthStartRateLimitFilter(RateLimiter limiter, ObjectMapper mapper) {
        this.limiter = limiter;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        if (!path.startsWith("/oauth2/authorization/")) { chain.doFilter(request, response); return; }
        if (!"GET".equals(request.getMethod())) {
            reject(response, 405, "로그인 버튼에서 다시 시작해주세요.");
            response.setHeader("Allow", "GET");
            return;
        }
        if (limiter == null) { reject(response, 503, "로그인을 잠시 사용할 수 없어요. 잠시 후 다시 시도해주세요."); return; }
        if (!limiter.tryConsume("oauth-start:" + IpExtractor.extract(request), RateLimiter.Policy.OAUTH_START)) {
            response.setHeader("Retry-After", "60");
            reject(response, 429, "로그인 요청이 많아요. 잠시 후 다시 시도해주세요.");
            return;
        }
        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(mapper.writeValueAsString(ApiResponse.error(message)));
    }
}
