package kr.it.reserve.global.security.ip;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.Arrays;

@Component
public class BrowserCookies {
    private final boolean secure;
    public BrowserCookies(@Value("${server.env:prod}") String env) { secure = !"local".equals(env); }
    private String name() { return secure ? "__Host-reserve_browser" : "reserve_browser"; }
    public String browserCookie(HttpServletRequest request) {
        Cookie[] values = request.getCookies();
        if (values == null) return null;
        var matches = Arrays.stream(values).filter(value -> name().equals(value.getName())).toList();
        if (matches.size() != 1) return null;
        String value = matches.getFirst().getValue();
        return value != null && value.matches("[A-Za-z0-9_-]{43}") ? value : null;
    }
    public void rememberBrowser(HttpServletResponse response, String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Invalid browser identifier");
        write(response, value, 30 * 86400);
    }
    public void forgetBrowser(HttpServletResponse response) { write(response, "", 0); }
    private void write(HttpServletResponse response, String value, int age) {
        response.addHeader("Set-Cookie", name() + "=" + value + "; Path=/; Max-Age=" + age
                + "; HttpOnly; " + (secure ? "Secure; " : "") + "SameSite=Lax");
    }
}
