package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.global.admission.ServiceAdmissionRoutes;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

final class PublicReadRateLimitFilter extends OncePerRequestFilter {
    private static final Pattern STORE_REVIEWS = Pattern.compile("/api/reviews/store/[^/]+(?:/stats)?/?");
    private static final Pattern REVIEW_PHOTOS = Pattern.compile("/api/reviews/[^/]+/photos/[^/]+/?");
    private final RateLimiter limiter;
    private final ObjectMapper mapper;

    PublicReadRateLimitFilter(RateLimiter limiter, ObjectMapper mapper) {
        this.limiter = limiter;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return limiter == null || !("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // 입장 필터가 검사한 같은 경로를 사용해 v1과 기존 주소가 한도를 공유한다.
        String path = ServiceAdmissionRoutes.path(request);
        RateLimiter.Policy policy = switch (path) {
            case "/api/stores", "/api/stores/regions", "/api/feed/posts", "/api/feed/regions",
                 "/api/waiting/stores", "/api/promotions/public" -> RateLimiter.Policy.PUBLIC_DIRECTORY_READ;
            case "/api/reservations/availability", "/api/reservations/calendar" ->
                    RateLimiter.Policy.PUBLIC_AVAILABILITY_READ;
            default -> REVIEW_PHOTOS.matcher(path).matches() ? RateLimiter.Policy.AD_METRIC
                    : STORE_REVIEWS.matcher(path).matches() ? RateLimiter.Policy.PUBLIC_REVIEW_READ : null;
        };
        String ip = IpExtractor.extract(request);
        // 피드 사진과 같은 IP 예산을 써 공개 사진 종류를 바꿔도 저장소 읽기 한도를 우회하지 못한다.
        String key = policy == RateLimiter.Policy.AD_METRIC ? "feed-image-read:" + ip : ip;
        if (policy == null || limiter.tryConsume(key, policy)) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(429);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json;charset=UTF-8");
        mapper.writeValue(response.getWriter(), ApiResponse.error("조회 요청이 너무 많아요. 잠시 후 다시 시도해주세요."));
    }
}
