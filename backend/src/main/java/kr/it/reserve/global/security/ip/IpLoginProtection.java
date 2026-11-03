package kr.it.reserve.global.security.ip;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.security.LoginIdentity;
import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;

public class IpLoginProtection {
    public static class Unavailable extends AuthException {
        public Unavailable() { super("접속 환경을 확인할 수 없어요. 잠시 후 다시 로그인해주세요.", HttpStatus.SERVICE_UNAVAILABLE); }
    }
    private static final String GRANT = IpLoginProtection.class.getName() + ".grant";
    private static final String PREFERENCE = IpLoginProtection.class.getName() + ".preference";
    private static final String COOKIE = IpLoginProtection.class.getName() + ".cookie";
    private static final String RESULT = IpLoginProtection.class.getName() + ".result";
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private kr.it.reserve.config.util.CookieUtil cookies = new kr.it.reserve.config.util.CookieUtil("prod");
    private final boolean enabled;
    private final IpProtectionStore store;
    private final TrustedClientIp addresses;
    private final byte[] key;
    private record Grant(Long member, int version, String network) {
        @Override public String toString() { return "Grant[redacted]"; }
    }

    IpLoginProtection(IpProtectionProperties properties, IpProtectionStore store) {
        enabled = properties.isEnabled();
        this.store = store;
        addresses = new TrustedClientIp(enabled ? properties.getTrustedProxies() : java.util.List.of());
        if (!enabled) { key = new byte[0]; return; }
        try { key = Base64.getDecoder().decode(properties.getFingerprintKey()); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("IP protection requires a dedicated base64 key"); }
        if (key.length != 32 || store == null) throw new IllegalArgumentException("IP protection requires a dedicated 32-byte key and Redis");
    }

    public boolean enabled() { return enabled; }
    public String clientAddress(HttpServletRequest request) { return addresses.extract(request); }
    public boolean needsStepUp(LoginIdentity member) {
        if (!enabled) return false;
        try { long risk = browserRisk(member, request()); return risk != 1 && risk != 2; }
        catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
    }

    public void bind(String ticket, LoginIdentity member) {
        if (!enabled) throw expired();
        try { store.bind(digest("ticket", ticket), binding(ticket, member)); }
        catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
    }
    public void requireBinding(String ticket, LoginIdentity member) {
        if (!enabled) throw expired();
        try { if (!store.binding(digest("ticket", ticket), binding(ticket, member))) throw expired(); }
        catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
    }
    public void issueEmailCode(String ticket, LoginIdentity member, String code) {
        requireBinding(ticket, member);
        try {
            long result = store.issueCode(digest("ticket", ticket), binding(ticket, member), digest("code", ticket + ":" + code));
            if (result == -2) throw new AuthException("인증 코드를 이미 보냈어요. 1분 후 다시 요청해주세요.", HttpStatus.TOO_MANY_REQUESTS);
            if (result != 1) throw expired();
        } catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
    }
    public boolean verifyEmailCode(String ticket, LoginIdentity member, String code) {
        requireBinding(ticket, member);
        if (code == null || !code.matches("[0-9]{6}")) return false;
        try { return store.verifyCode(digest("ticket", ticket), binding(ticket, member), digest("code", ticket + ":" + code)); }
        catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
    }

    /** 실제 확인을 마친 가입·추가 인증 경로만 현재 요청에 허용해요. */
    public void approveCurrent(LoginIdentity member) {
        if (!enabled) return;
        HttpServletRequest request = request();
        request.setAttribute(GRANT, new Grant(member.getId(), member.getAuthVersion(), network(request)));
    }

    public Runnable beforeSession(LoginIdentity member, boolean strong) {
        if (!enabled) return () -> { };
        HttpServletRequest request = request();
        String network = network(request), owner = owner(member);
        Object proof = request.getAttribute(GRANT);
        boolean approved = proof instanceof Grant grant && grant.member().equals(member.getId())
                && grant.version() == member.getAuthVersion() && grant.network().equals(network);
        try {
            if (!strong && !approved && !trustedBrowser(member, request)) throw expired();
        } catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
        return () -> {
            // 신뢰 이력은 DB 세션 발급이 커밋된 뒤에만 남겨요. 기록 장애는 기존 제한으로 복구해요.
            try {
                store.remember(owner, network);
                Object preference = request.getAttribute(PREFERENCE);
                String raw = cookies.browserCookie(request);
                if (Boolean.FALSE.equals(preference)) {
                    if (raw != null) store.forgetBrowser(owner, digest("browser", raw));
                    request.setAttribute(COOKIE, "");
                    request.setAttribute(RESULT, "NOT_REMEMBERED");
                } else if ((strong || approved) && Boolean.TRUE.equals(preference)) {
                    if (raw == null) { byte[] random = new byte[32]; new java.security.SecureRandom().nextBytes(random); raw = Base64.getUrlEncoder().withoutPadding().encodeToString(random); }
                    store.rememberBrowser(owner, digest("browser", raw), network, prefix(request), family(request));
                    request.setAttribute(COOKIE, raw);
                    request.setAttribute(RESULT, "REMEMBERED");
                }
            } catch (IpProtectionStore.Unavailable failure) { request.setAttribute(RESULT, "UNAVAILABLE"); }
        };
    }

    private boolean trustedBrowser(LoginIdentity member, HttpServletRequest request) {
        long risk = browserRisk(member, request);
        return risk == 1 || risk == 2;
    }
    private long browserRisk(LoginIdentity member, HttpServletRequest request) {
        String raw = cookies.browserCookie(request);
        return raw == null ? 0 : store.browser(owner(member), digest("browser", raw), network(request), prefix(request), family(request));
    }
    public String browserStatus(LoginIdentity member) {
        if (!enabled) return "DISABLED";
        try { long risk = browserRisk(member, request()); return risk >= 1 && risk <= 3 ? "REMEMBERED" : "NOT_REMEMBERED"; }
        catch (IpProtectionStore.Unavailable | Unavailable failure) { return "UNAVAILABLE"; }
    }
    public void prepareBrowser(LoginIdentity member, Boolean remember) {
        if (!enabled) return;
        // 기존 동의만 이어주고 새 브라우저는 명시적으로 선택해야 해요.
        if (remember != null) request().setAttribute(PREFERENCE, remember);
    }
    public void forgetBrowser(LoginIdentity member) {
        if (!enabled) return;
        HttpServletRequest request = request();
        String raw = cookies.browserCookie(request);
        try { if (raw != null) store.forgetBrowser(owner(member), digest("browser", raw)); }
        catch (IpProtectionStore.Unavailable failure) { throw unavailable(); }
        request.setAttribute(COOKIE, "");
    }
    public void writeBrowserCookie(jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        Object value = request.getAttribute(COOKIE);
        if (value instanceof String raw) {
            if (raw.isEmpty()) cookies.forgetBrowser(response);
            else cookies.rememberBrowser(response, raw);
        }
    }
    public String browserResult() {
        if (!enabled) return "DISABLED";
        Object value = request().getAttribute(RESULT);
        return value instanceof String result ? result : null;
    }
    public String sensitiveBinding(LoginIdentity member, String session) {
        if (!enabled) return "disabled";
        HttpServletRequest request = request();
        return digest("sensitive", member.getId() + ":" + member.getAuthVersion() + ":" + session + ":" + network(request)
                + ":" + cookies.browserCookie(request) + ":" + family(request));
    }
    private String prefix(HttpServletRequest request) {
        String literal = addresses.extract(request);
        if (literal == null) throw unavailable();
        try {
            byte[] address = java.net.InetAddress.getByName(literal).getAddress();
            return digest("prefix", HexFormat.of().formatHex(java.util.Arrays.copyOf(address, address.length == 4 ? 3 : 8)));
        } catch (java.net.UnknownHostException invalid) { throw unavailable(); }
    }
    private String family(HttpServletRequest request) {
        String agent = request.getHeader("User-Agent");
        if (agent == null || agent.length() > 2048) agent = "";
        String os = agent.contains("Android") ? "android" : agent.contains("iPhone") || agent.contains("iPad") ? "ios"
                : agent.contains("Windows") ? "windows" : agent.contains("Macintosh") ? "mac" : agent.contains("Linux") ? "linux" : "other";
        String browser = agent.contains("Edg/") ? "edge" : agent.contains("Firefox/") || agent.contains("FxiOS/") ? "firefox"
                : agent.contains("Chrome/") || agent.contains("CriOS/") ? "chrome" : agent.contains("Safari/") ? "safari" : "other";
        return digest("family", os + ":" + browser);
    }

    public long blocked(HttpServletRequest request) {
        if (!enabled || addresses.extract(request) == null) return 0;
        try { return Math.max(0, store.blocked(network(request))); }
        catch (IpProtectionStore.Unavailable failure) { return 0; }
    }
    public void failed(HttpServletRequest request) {
        if (!enabled || addresses.extract(request) == null) return;
        try { store.failed(network(request)); } catch (IpProtectionStore.Unavailable ignored) { }
    }

    private String owner(LoginIdentity member) { return digest("member", member.getId() + ":" + member.getAuthVersion()); }
    private String binding(String ticket, LoginIdentity member) { return digest("binding", member.getId() + ":" + network(request()) + ":" + cookies.browserCookie(request()) + ":" + family(request()) + ":" + ticket); }
    private String network(HttpServletRequest request) {
        String literal = addresses.extract(request);
        if (literal == null) throw unavailable();
        return digest("network", literal);
    }
    private String digest(String purpose, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException impossible) { throw new IllegalStateException("HMAC-SHA256 is required", impossible); }
    }
    private HttpServletRequest request() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) return attributes.getRequest();
        throw unavailable();
    }
    private static AuthException unavailable() { return new Unavailable(); }
    private static AuthException expired() { return new AuthException("접속 환경 확인이 필요해요. 로그인 화면에서 다시 시작해주세요.", HttpStatus.UNAUTHORIZED); }
}
