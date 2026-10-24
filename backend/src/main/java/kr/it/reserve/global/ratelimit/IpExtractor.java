package kr.it.reserve.global.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 신뢰하는 nginx가 덮어쓴 X-Real-IP, XFF의 마지막 값, remoteAddr 순으로 IP를 읽는다.
 * nginx가 XFF에 값을 이어 붙이는 구성에서는 첫 값이 클라이언트 입력이므로 제한 키로 쓰지 않는다.
 * 이 신뢰 모델은 앱 포트의 외부 직접 접근을 차단하고 nginx가 헤더를 설정한다는 전제가 필요하다.
 * CDN·WAF 등 프록시 계층을 추가하면 신뢰 경계와 실제 IP 전달 규칙을 함께 검토해야 한다.
 */
public final class IpExtractor {

    /** 파싱 실패 시 쓰는 값. 이상 요청이 한 버킷을 공유하게 되므로 오히려 조이는 쪽이다. */
    private static final String UNKNOWN = "unknown";

    /** 헤더 값 폭주 방어 — IPv6 최대 표기(45자)보다 넉넉하되 무한하지는 않게. */
    private static final int MAX_IP_LENGTH = 64;

    private IpExtractor() {}

    public static String extract(HttpServletRequest request) {
        String realIp = sanitize(request.getHeader("X-Real-IP"));
        if (realIp != null) {
            return realIp;
        }

        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] hops = forwarded.split(",");
            String lastHop = sanitize(hops[hops.length - 1]);
            if (lastHop != null) {
                return lastHop;
            }
        }

        String remoteAddr = sanitize(request.getRemoteAddr());
        return remoteAddr != null ? remoteAddr : UNKNOWN;
    }

    /**
     * IP 리터럴 형식이 아닌 값을 걸러낸다.
     *
     * <p>이 값이 rate limit 키가 되므로 검증하지 않으면 임의 문자열이 그대로 키로 들어가
     * 버킷 맵을 오염시킨다. 호스트명을 받으면 DNS를 조회하는 {@code InetAddress} 계열 API는
     * 요청 경로에서 외부 지연을 유발할 수 있어 쓰지 않고, 문자 구성으로만 판별한다
     * (IP 리터럴에 나올 수 있는 문자는 16진수·점·콜론·IPv6 zone id의 % 뿐이다).
     *
     * @return 정상이면 트림된 IP, 아니면 null
     */
    private static String sanitize(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty() || value.length() > MAX_IP_LENGTH) {
            return null;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean allowed = (c >= '0' && c <= '9')
                    || (c >= 'a' && c <= 'f')
                    || (c >= 'A' && c <= 'F')
                    || c == '.' || c == ':' || c == '%';
            if (!allowed) {
                return null;
            }
        }
        return value;
    }
}
