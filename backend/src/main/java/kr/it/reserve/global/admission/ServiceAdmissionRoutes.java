package kr.it.reserve.global.admission;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;

/** Capacity policy never replaces the downstream authentication or resource-owner checks. */
public final class ServiceAdmissionRoutes {
    private ServiceAdmissionRoutes() { }

    /** Servlet paths are already decoded. Mock/default-mapping fallbacks decode the raw URI exactly once. */
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
        // Completing, cancelling, or recovering an existing transaction must remain possible.
        if ("PATCH".equals(method) || "DELETE".equals(method)) return true;
        for (String prefix : new String[]{"/api/service-admission", "/api/auth", "/api/email",
                "/api/password-reset", "/api/member", "/api/payment", "/api/admin",
                "/api/oauth/events", "/api/chat", "/api/inquiries", "/api/updates"}) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) return true;
        }
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
