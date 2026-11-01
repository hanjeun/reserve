package kr.it.reserve.global.security.ip;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import java.net.InetAddress;
import java.util.List;

final class TrustedClientIp {
    private final List<IpAddressMatcher> proxies;

    TrustedClientIp(List<String> trustedProxies) {
        proxies = trustedProxies.stream().map(value -> {
            String[] parts = value.split("/", -1);
            String address = literal(parts[0]);
            if (parts.length > 2 || address == null) throw new IllegalArgumentException("Invalid trusted proxy literal");
            if (parts.length == 2 && (!parts[1].matches("[0-9]{1,3}") || Integer.parseInt(parts[1]) < 1
                    || Integer.parseInt(parts[1]) > (address.contains(":") ? 128 : 32)))
                throw new IllegalArgumentException("Invalid trusted proxy prefix");
            return new IpAddressMatcher(value);
        }).toList();
    }

    String extract(HttpServletRequest request) {
        String peer = literal(request.getRemoteAddr());
        if (peer == null) return null;
        if (proxies.stream().noneMatch(proxy -> proxy.matches(peer))) return peer;
        // 허용한 프록시가 덮어쓰는 헤더만 읽고 클라이언트가 보낸 XFF는 쓰지 않아요.
        return literal(request.getHeader("X-Real-IP"));
    }

    static String literal(String value) {
        if (value == null || value.length() > 45 || !value.equals(value.strip()) || value.contains("%")) return null;
        if (!value.contains(":")) {
            String[] parts = value.split("\\.", -1);
            if (parts.length != 4) return null;
            for (String part : parts) {
                if (!part.matches("0|[1-9][0-9]{0,2}") || Integer.parseInt(part) > 255) return null;
            }
        } else if (!value.matches("[0-9a-fA-F:.]+")) return null;
        try { return InetAddress.getByName(value).getHostAddress(); }
        catch (java.net.UnknownHostException invalid) { return null; }
    }
}
