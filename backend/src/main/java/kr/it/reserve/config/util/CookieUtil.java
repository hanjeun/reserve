package kr.it.reserve.config.util;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Component
public class CookieUtil {

    private static boolean secureCookie = false;

    @Value("${server.env:prod}")
    public void setServerEnv(String env) {
        secureCookie = !"local".equals(env);  // local이 아니면 Secure=true
    }

    public static String getCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        
        if (cookies != null) {
            return Arrays.stream(cookies)
                    .filter(cookie -> name.equals(cookie.getName()))
                    .findFirst()
                    .map(Cookie::getValue)
                    .orElse(null);
        }
        
        return null;
    }

    // Jakarta Cookie API는 SameSite를 직접 지원하지 않아 Set-Cookie 헤더를 직접 만든다.
    //
    // 2026-07-29: 운영에서만 SameSite=None을 쓰던 것을 전 환경 Lax로 바꿨다.
    // None은 cross-site 요청에도 쿠키를 붙이는데, JwtAuthenticationFilter가 쿠키로 인증하고
    // SecurityConfig는 csrf.disable() 상태라 CSRF가 실제로 성립했다.
    // @ModelAttribute로 multipart를 받는 POST 3개(가게 등록·광고 신청·사업자 인증)는
    // CORS preflight가 뜨지 않아 CORS로도 막히지 않는다. (CodeQL java/spring-disabled-csrf-protection)
    //
    // Lax로 되돌려도 되는 근거:
    //  - 프론트와 API가 같은 출처다(nginx가 /api/를 같은 도메인에서 프록시, 번들에도 다른 API 도메인 없음)
    //    → refresh(POST /api/auth/refresh)는 same-site라 Lax에서도 쿠키가 간다
    //  - 로컬 환경은 원래부터 Lax였고 문제없이 동작해왔다
    //  - 결제사 복귀(/api/payment/mobile-redirect)와 OAuth 콜백은 top-level GET이라 Lax에서도 쿠키가 간다
    //    (Strict였다면 이 둘이 깨진다 — Strict로 올리지 말 것)
    private static final String SAME_SITE = "Lax";

    public static void addCookie(HttpServletResponse response, String name, String value, int maxAge) {
        String sameSite = SAME_SITE;

        StringBuilder sb = new StringBuilder();
        sb.append(name).append("=").append(value).append("; ");
        sb.append("Path=/; ");
        sb.append("Max-Age=").append(maxAge).append("; ");
        sb.append("HttpOnly; ");
        if (secureCookie) sb.append("Secure; ");
        sb.append("SameSite=").append(sameSite);

        response.addHeader("Set-Cookie", sb.toString());
    }

    public static void deleteCookie(HttpServletRequest request, HttpServletResponse response, String name) {
        // addCookie와 동일한 SameSite/Secure 속성으로 삭제해야 브라우저가 매칭해서 삭제함
        String sameSite = SAME_SITE;

        StringBuilder sb = new StringBuilder();
        sb.append(name).append("=; ");
        sb.append("Path=/; ");
        sb.append("Max-Age=0; ");
        sb.append("HttpOnly; ");
        if (secureCookie) sb.append("Secure; ");
        sb.append("SameSite=").append(sameSite);

        response.addHeader("Set-Cookie", sb.toString());
    }
}
