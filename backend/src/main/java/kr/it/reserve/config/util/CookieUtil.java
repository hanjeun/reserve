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
    /** 인증 경로가 겹치지 않아 요청에는 리프레시 쿠키 하나만 포함된다. */
    private static final List<String> REFRESH_PATHS = List.of("/api/auth", "/api/v1/auth");
    private final boolean secureCookie;

    public CookieUtil(@Value("${server.env:prod}") String env) { this.secureCookie = !"local".equals(env); }

    /** Cookie 헤더에는 Path가 없어 값이 다른 동명 쿠키는 구분할 수 없다. */
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
            // 넓은 경로의 기존 쿠키를 지운 뒤 인증 경로별 쿠키를 설정한다. 다른 경로에는 원문 토큰을 두지 않는다.
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
