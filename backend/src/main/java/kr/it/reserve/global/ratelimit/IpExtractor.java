package kr.it.reserve.global.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

/**
 * nginx 리버스 프록시 환경에서 실제 클라이언트 IP를 추출한다.
 *
 * <h2>왜 X-Forwarded-For의 첫 번째 값을 쓰면 안 되는가</h2>
 * nginx는 {@code proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for} 로 이 헤더를
 * <b>덮어쓰지 않고 이어붙인다</b>(nginx/default.conf L56·70·84·146).
 * 클라이언트가 {@code X-Forwarded-For: 1.2.3.4} 를 직접 보내면 백엔드가 받는 값은
 * {@code "1.2.3.4, <진짜 IP>"} 가 된다. 즉 <b>첫 번째 값은 공격자가 정한다.</b>
 * 그 값으로 rate limit 키를 만들면 요청마다 헤더만 바꿔 로그인·회원가입 제한을 무한히 우회할 수 있다.
 *
 * <h2>신뢰 경계</h2>
 * 이 앱으로 오는 트래픽은 전부 nginx를 거친다(8080/8081은 외부에서 차단돼 있다).
 * nginx가 <b>덮어쓰는</b> 헤더만 신뢰할 수 있다:
 * <ul>
 *   <li>{@code X-Real-IP} — {@code proxy_set_header X-Real-IP $remote_addr} 로 항상 덮어쓴다 → <b>신뢰 가능</b></li>
 *   <li>{@code X-Forwarded-For} — 이어붙으므로 <b>마지막 항목</b>만 nginx가 채운 값이다</li>
 * </ul>
 * 따라서 우선순위는 X-Real-IP → XFF의 <b>마지막</b> 항목 → {@code remoteAddr} 순이다.
 *
 * <p>⚠️ 앞단에 CDN·WAF(예: Cloudflare)를 붙이면 프록시가 한 단 늘어난다.
 * 그때는 "마지막 항목"이 CDN IP가 되므로 이 클래스를 다시 손봐야 한다.
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
