package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.admission.ServiceAdmissionRoutes;
import kr.it.reserve.global.admission.ServiceAdmissionService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;

/** CORS·CSRF 뒤, JWT 조회 앞에서 처리한다. 입장권은 API 접근 권한을 부여하지 않는다. */
@Slf4j
public final class ServiceAdmissionHttpFilter extends OncePerRequestFilter {
    private static final String PATH = "/api/service-admission";
    private static final String UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private final ObjectProvider<ServiceAdmissionService> services;
    private final ObjectProvider<RateLimiter> limiters;
    private final ObjectMapper mapper;
    private final CookieUtil cookies;
    private final String cookieName;
    private final boolean enabled;
    private final Semaphore emergencyRequests = new Semaphore(8);
    private final AtomicLong lastUnavailableLog = new AtomicLong(Long.MIN_VALUE);

    public ServiceAdmissionHttpFilter(ObjectProvider<ServiceAdmissionService> services, ObjectProvider<RateLimiter> limiters,
                                      ObjectMapper mapper, boolean enabled, String environment) {
        this.services = services; this.limiters = limiters; this.mapper = mapper; this.enabled = enabled;
        cookies = new CookieUtil(environment);
        cookieName = "local".equals(environment) ? "reserve_entry" : "__Host-reserve-entry";
    }

    public record PublicEntry(String campaignId, ServiceAdmissionService.Mode mode, String state, long position,
                              long expiresAt, long absoluteExpiresAt, long serverTime, int pollAfterSeconds,
                              int heartbeatTimeoutSeconds, String continuityId) { }
    public record GateError(String code, ServiceAdmissionService.Mode mode) { }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path;
        try { path = ServiceAdmissionRoutes.path(request); }
        catch (IllegalArgumentException malformed) {
            failure(response, 400, null, "서비스 입장 요청 경로를 확인할 수 없어요.");
            return;
        }
        if (PATH.equals(path) && !"OPTIONS".equals(request.getMethod())) {
            handleEntry(request, response);
            return;
        }
        if (!enabled || ServiceAdmissionRoutes.preserved(request.getMethod(), path)) {
            chain.doFilter(request, response);
            return;
        }
        boolean emergencyAcquired = false;
        try {
            var service = services.getIfAvailable();
            if (service == null) { unavailable(response); return; }
            var mode = service.currentMode();
            boolean protectedRequest = ServiceAdmissionRoutes.protectedBy(mode, request.getMethod(), path);
            if (mode == ServiceAdmissionService.Mode.EMERGENCY && protectedRequest) {
                var limiter = limiters.getIfAvailable();
                if (limiter == null) { unavailable(response); return; }
                if (!limiter.tryConsume("service-entry:emergency:ip:" + IpExtractor.extract(request), RateLimiter.Policy.SERVICE_EMERGENCY_IP)
                        || !limiter.tryConsume("service-entry:emergency:global", RateLimiter.Policy.SERVICE_EMERGENCY_GLOBAL)) {
                    throttled(response, service);
                    return;
                }
            }
            if (protectedRequest && !service.admitted(ticket(request))) {
                failure(response, 429, new GateError("SERVICE_ADMISSION_REQUIRED", mode),
                        "접속자가 많아 입장 순서를 기다리고 있어요.");
                return;
            }
            if (mode == ServiceAdmissionService.Mode.EMERGENCY && protectedRequest) {
                if (!emergencyRequests.tryAcquire()) { throttled(response, service); return; }
                emergencyAcquired = true;
            }
        } catch (IllegalArgumentException e) {
            failure(response, 400, null, "서비스 입장 정보를 확인할 수 없어요.");
            return;
        } catch (RuntimeException e) {
            logUnavailable("check", e);
            unavailable(response);
            return;
        }
        // 이후 인증·업무 실패는 원래 예외 처리 경계를 유지한다.
        try { chain.doFilter(request, response); }
        finally { if (emergencyAcquired) emergencyRequests.release(); }
    }

    private void handleEntry(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String method = request.getMethod();
        if (!Set.of("GET", "POST", "DELETE").contains(method)) {
            response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
            failure(response, 405, null, "지원하지 않는 입장 요청이에요.");
            return;
        }
        if (!enabled) {
            success(response, new PublicEntry("service-entry", ServiceAdmissionService.Mode.OFF, "BYPASS", 0, 0, 0,
                    System.currentTimeMillis(), 60, 90, null));
            return;
        }
        try {
            var service = services.getIfAvailable();
            if (service == null) { unavailable(response); return; }
            String ticket = ticket(request);
            var limiter = limiters.getIfAvailable();
            if (limiter == null) { unavailable(response); return; }
            boolean allowed = method.equals("POST")
                    ? limiter.tryConsume("service-entry:join:" + IpExtractor.extract(request), RateLimiter.Policy.SERVICE_ENTRY_JOIN)
                    : limiter.tryConsume("service-entry:ip-read:" + IpExtractor.extract(request), RateLimiter.Policy.SERVICE_ENTRY_IP_READ);
            if (!allowed) {
                failure(response, 429, new GateError("SERVICE_ADMISSION_RATE_LIMITED", null), "입장 상태를 잠시 후 다시 확인해주세요.");
                return;
            }
            var entry = switch (method) {
                case "POST" -> service.join(ticket);
                case "DELETE" -> service.cancel(ticket);
                default -> service.status(ticket);
            };
            // IP 제한으로 Redis 작업량을 묶고, 서버가 확인한 유효 입장권에만 응답 제한 버킷을 만든다.
            if (method.equals("GET") && entry.ticket() != null
                    && !limiter.tryConsume("service-entry:read:" + digest(entry.ticket()), RateLimiter.Policy.SERVICE_ENTRY_READ)) {
                failure(response, 429, new GateError("SERVICE_ADMISSION_RATE_LIMITED", null), "입장 상태를 잠시 후 다시 확인해주세요.");
                return;
            }
            if (method.equals("POST") && entry.ticket() != null) {
                long seconds = Math.max(1, (entry.absoluteExpiresAt() > 0 ? entry.absoluteExpiresAt() - entry.serverTime()
                        : 7L * 86400 * 1000) / 1000);
                cookies.addCookie(response, cookieName, entry.ticket(), Math.toIntExact(Math.min(7L * 86400, seconds)));
            } else if (method.equals("DELETE")) cookies.deleteCookie(response, cookieName);
            success(response, new PublicEntry("service-entry", entry.mode(), entry.state(), entry.position(), entry.expiresAt(),
                    entry.absoluteExpiresAt(), entry.serverTime(), entry.pollAfterSeconds(), entry.heartbeatTimeoutSeconds(),
                    entry.ticket() == null ? null : digest(entry.ticket())));
        } catch (IllegalArgumentException e) {
            failure(response, 400, null, "서비스 입장 정보를 확인할 수 없어요.");
        } catch (RuntimeException e) {
            logUnavailable("endpoint", e);
            unavailable(response);
        }
    }

    private String ticket(HttpServletRequest request) {
        var values = CookieUtil.getCookieValues(request, cookieName);
        if (values.size() > 1) throw new IllegalArgumentException("Ambiguous service entry cookies");
        String value = values.isEmpty() ? null : values.getFirst();
        return value != null && value.matches(UUID) ? value : null;
    }

    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private void logUnavailable(String phase, RuntimeException failure) {
        long now = System.nanoTime();
        long previous = lastUnavailableLog.get();
        long elapsed = now - previous;
        if (previous != Long.MIN_VALUE && elapsed >= 0 && elapsed < 5_000_000_000L) return;
        if (lastUnavailableLog.compareAndSet(previous, now)) {
            log.warn("Service admission unavailable: phase={} errorType={}", phase, failure.getClass().getSimpleName());
        }
    }
    private void unavailable(HttpServletResponse response) throws IOException {
        failure(response, 503, new GateError("SERVICE_ADMISSION_UNAVAILABLE", null),
                "입장 상태를 잠시 확인할 수 없어요. 잠시 후 다시 확인해주세요.");
    }
    private void throttled(HttpServletResponse response, ServiceAdmissionService service) throws IOException {
        service.noteEmergencyThrottle();
        failure(response, 429, new GateError("SERVICE_ADMISSION_THROTTLED", ServiceAdmissionService.Mode.EMERGENCY),
                "접속자가 많아 요청이 잠시 제한됐어요. 10초 후 다시 시도해주세요.");
    }
    private void failure(HttpServletResponse response, int status, Object data, String message) throws IOException {
        response.setStatus(status);
        if (status == 429 || status == 503) response.setHeader("Retry-After",
                data instanceof GateError error && "SERVICE_ADMISSION_THROTTLED".equals(error.code()) ? "10" : "4");
        write(response, ApiResponse.builder().success(false).data(data).message(message).timestamp(LocalDateTime.now()).build());
    }
    private void success(HttpServletResponse response, PublicEntry entry) throws IOException {
        response.setStatus(200);
        write(response, ApiResponse.success(entry, "서비스 입장 상태를 확인했어요."));
    }
    private void write(HttpServletResponse response, Object value) throws IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json;charset=UTF-8");
        mapper.writeValue(response.getWriter(), value);
    }
}
