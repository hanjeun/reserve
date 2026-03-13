package com.reserve.config.util;

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

    public static void addCookie(HttpServletResponse response, String name, String value, int maxAge) {
        // Jakarta Cookie API는 SameSite를 직접 지원 안 하므로 Set-Cookie 헤더로 직접 설정
        // SameSite=Lax: GET 이외의 cross-site 요청(POST 등)에서는 쿠키 미전송 → refresh 실패 원인
        // SameSite=None: Secure와 함께 사용 시 모든 요청에 쿠키 전송 (배포 환경에서 필요)
        // SameSite=Strict: same-site 요청에서만 전송
        String sameSite = secureCookie ? "None" : "Lax";

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
        String sameSite = secureCookie ? "None" : "Lax";

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
