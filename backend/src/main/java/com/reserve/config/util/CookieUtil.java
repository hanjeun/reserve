package com.reserve.config.util;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Arrays;

public class CookieUtil {

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
        Cookie cookie = new Cookie(name, value);
        cookie.setHttpOnly(true);  // ✅ JavaScript 접근 차단 (XSS 방어)
        cookie.setSecure(false);   // ⚠️ 개발 환경에서는 false (배포 시 true로 변경)
        cookie.setPath("/");
        cookie.setMaxAge(maxAge);
        // cookie.setSameSite("Lax");  // Spring Boot 3.x에서는 자동 설정됨
        
        response.addCookie(cookie);
    }

    public static void deleteCookie(HttpServletRequest request, HttpServletResponse response, String name) {
        Cookie[] cookies = request.getCookies();
        
        if (cookies != null) {
            Arrays.stream(cookies)
                    .filter(cookie -> name.equals(cookie.getName()))
                    .forEach(cookie -> {
                        cookie.setValue("");
                        cookie.setPath("/");
                        cookie.setMaxAge(0);
                        response.addCookie(cookie);
                    });
        }
    }
}
