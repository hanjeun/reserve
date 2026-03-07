package com.reserve.global.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

public final class IpExtractor {

    private IpExtractor() {}

    /**
     * nginx 리버스 프록시 환경에서 실제 클라이언트 IP 추출.
     * X-Forwarded-For → X-Real-IP → remoteAddr 순으로 조회.
     */
    public static String extract(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // 여러 IP가 쉼표로 연결된 경우 첫 번째가 원본 클라이언트
            return xff.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isBlank()) {
            return xRealIp.trim();
        }
        return request.getRemoteAddr();
    }
}
