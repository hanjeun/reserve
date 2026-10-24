package kr.it.reserve.config.util;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.global.error.AuthException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

@Component
public class CookieUtil {
    private static final String REFRESH = "refresh_token";
    /** Nonoverlapping auth aliases: each request carries one refresh cookie, never both narrow paths. */
    private static final List<String> REFRESH_PATHS = List.of("/api/auth", "/api/v1/auth");
    private final boolean secureCookie;

    public CookieUtil(@Value("${server.env:prod}") String env) { this.secureCookie = !"local".equals(env); }

    /** The Cookie header carries no Path information. Distinct same-name credentials are ambiguous. */
    public static String getCookie(HttpServletRequest request, String name) {
        List<String> values = getCookieValues(request, name);
        if (values.size() > 1 && ("access_token".equals(name) || REFRESH.equals(name))) {
            throw new AuthException("로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.");
        }
        return values.isEmpty() ? null : values.getFirst();
    }

    public static List<String> getCookieValues(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        return cookies == null ? List.of() : Arrays.stream(cookies)
                .filter(cookie -> name.equals(cookie.getName())).map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank()).distinct().toList();
    }

    public void addCookie(HttpServletResponse response, String name, String value, int maxAge) {
        if (REFRESH.equals(name)) {
            // Remove the old wide cookie before setting both auth aliases. No raw token is put on other routes.
            write(response, name, "", 0, "/");
            for (String path : REFRESH_PATHS) write(response, name, value, maxAge, path);
        } else {
            write(response, name, value, maxAge, "/");
        }
    }

    public void deleteCookie(HttpServletResponse response, String name) {
        if (REFRESH.equals(name)) for (String path : REFRESH_PATHS) write(response, name, "", 0, path);
        write(response, name, "", 0, "/");
    }

    private void write(HttpServletResponse response, String name, String value, int maxAge, String path) {
        response.addHeader("Set-Cookie", name + "=" + value + "; Path=" + path + "; Max-Age=" + maxAge
                + "; HttpOnly; " + (secureCookie ? "Secure; " : "") + "SameSite=Lax");
    }
}
