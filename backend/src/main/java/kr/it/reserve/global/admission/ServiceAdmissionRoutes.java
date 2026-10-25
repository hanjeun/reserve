package kr.it.reserve.global.admission;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;

/** 입장 정책은 이후 인증이나 자원 소유권 검사를 대체하지 않는다. */
public final class ServiceAdmissionRoutes {
    private ServiceAdmissionRoutes() { }

    /** 서블릿 경로는 이미 디코딩되어 있다. 원시 URI를 대신 사용할 때만 한 번 디코딩한다. */
    public static String path(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isEmpty()) {
            String raw = request.getRequestURI();
            String context = request.getContextPath();
            if (!context.isEmpty()) {
                if (!raw.startsWith(context + "/") && !raw.equals(context)) throw new IllegalArgumentException("Invalid context path");
                raw = raw.substring(context.length());
            }
            path = UriUtils.decode(raw, StandardCharsets.UTF_8);
        } else if (request.getPathInfo() != null) {
            path += request.getPathInfo();
        }
        return canonical(path);
    }

    public static String canonical(String path) {
        return path.startsWith("/api/v1/") ? "/api/" + path.substring(8) : path;
    }

    public static boolean core(String method, String path) {
        if (!"POST".equals(method)) return false;
        return path.equals("/api/reservations") || path.equals("/api/stores")
                || path.matches("/api/waiting/stores/[0-9]+/entries");
    }

    public static boolean preserved(String method, String path) {
        if (!path.startsWith("/api/") || "OPTIONS".equals(method)) return true;
        // 기존 거래의 완료·취소·결과 복구 경로는 계속 허용한다.
        if ("PATCH".equals(method) || "DELETE".equals(method)) return true;
        for (String prefix : new String[]{"/api/service-admission", "/api/auth", "/api/email",
                "/api/password-reset", "/api/member", "/api/payment", "/api/admin",
                "/api/oauth/events", "/api/chat", "/api/inquiries", "/api/updates"}) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) return true;
        }
        if ("GET".equals(method) && path.equals("/api/search/me")) return true;
        if (path.equals("/api/csp-reports")) return true;
        if (path.startsWith("/api/reservations/")
                && !path.equals("/api/reservations/availability") && !path.equals("/api/reservations/calendar")
                && !path.startsWith("/api/reservations/admission")) return true;
        if (path.startsWith("/api/waiting/") && !path.equals("/api/waiting/stores")
                && !core(method, path)) return true;
        return false;
    }

    public static boolean protectedBy(ServiceAdmissionService.Mode mode, String method, String path) {
        if (mode == ServiceAdmissionService.Mode.OFF) return false;
        if (mode == ServiceAdmissionService.Mode.CORE) return core(method, path);
        return !preserved(method, path);
    }
}
