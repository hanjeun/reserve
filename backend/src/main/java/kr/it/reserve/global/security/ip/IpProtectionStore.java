package kr.it.reserve.global.security.ip;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scripting.support.ResourceScriptSource;
import java.util.ArrayList;
import java.util.List;

class IpProtectionStore {
    static class Unavailable extends RuntimeException { }
    private final StringRedisTemplate redis;
    private final RedisFailureBackoff backoff;
    private final String prefix;
    private final DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    private final DefaultRedisScript<List> listScript = new DefaultRedisScript<>();
    record BrowserEntry(String browser, long expiresAt, String metadata) { }

    IpProtectionStore(StringRedisTemplate redis, RedisNamespace namespace, RedisFailureBackoff backoff) {
        this.redis = redis;
        this.backoff = backoff;
        prefix = namespace.prefix() + "ip-protection:";
        var source = new ResourceScriptSource(new ClassPathResource("redis/ip-protection.lua"));
        script.setScriptSource(source);
        script.setResultType(Long.class);
        listScript.setScriptSource(source);
        listScript.setResultType(List.class);
    }

    boolean known(String member, String network) { return call("known", List.of(key(member, "known")), network) == 1; }
    void remember(String member, String network) { call("remember", List.of(key(member, "known")), network); }
    long browser(String member, String browser, String network, String prefix, String family) {
        return call("browser", browserKeys(member), browser, network, prefix, family);
    }
    boolean renewBrowser(String member, String browser, String network, String prefix, String family) {
        return call("renew-browser", browserKeys(member), browser, network, prefix, family) == 1;
    }
    void rememberBrowser(String member, String browser, String network, String prefix, String family) {
        call("remember-browser", browserKeys(member), browser, network, prefix, family);
    }
    void rememberBrowser(String member, String browser, String network, String prefix, String family, String environment, String session) {
        call("remember-browser", browserKeys(member), browser, network, prefix, family, environment, session);
    }
    boolean registerBrowser(String member, String browser, String network, String prefix, String family,
            String environment, String session, String ticket, String binding, String nextBinding) {
        // 등록과 확인 요청 처리를 원자적으로 묶어요. 다음 문맥이 비어 있으면 확인 요청을 소비해요.
        var keys = new ArrayList<>(browserKeys(member));
        keys.add(key(ticket, "challenge"));
        return call("register-browser", keys, browser, network, prefix, family, environment, session, binding, nextBinding) == 1;
    }
    void trackBrowser(String member, String browser, String family, String environment, String session) {
        call("track-browser", browserKeys(member), browser, family, environment, session);
    }
    List<BrowserEntry> devices(String member) {
        List<?> rows = execute(listScript, "devices", browserKeys(member));
        return rows.stream().map(row -> {
            List<?> entry = (List<?>) row;
            return new BrowserEntry((String) entry.get(0), Long.parseLong((String) entry.get(1)), (String) entry.get(2));
        }).toList();
    }
    void forgetBrowser(String member, String browser) {
        call("forget-browser", browserKeys(member), browser);
    }
    void forgetBrowsers(String member) { call("forget-browsers", browserKeys(member)); }
    void bind(String ticket, String binding) { call("bind", List.of(key(ticket, "challenge")), binding); }
    boolean binding(String ticket, String binding) { return call("binding", List.of(key(ticket, "challenge")), binding) == 1; }
    long issueCode(String ticket, String binding, String hash) { return call("issue-code", List.of(key(ticket, "challenge")), binding, hash); }
    boolean verifyCode(String ticket, String binding, String hash) { return call("verify-code", List.of(key(ticket, "challenge")), binding, hash) == 1; }
    long blocked(String network) { return call("blocked", List.of(key(network, "block"))); }
    void failed(String network) { call("failed", List.of(key(network, "failures"), key(network, "block"), key(network, "strikes"))); }

    private String key(String digest, String kind) { return prefix + "{" + digest + "}:" + kind; }
    private List<String> browserKeys(String member) {
        return List.of(key(member, "browsers"), key(member, "browser-details"), key(member, "browser-sessions"));
    }
    private long call(String operation, List<String> keys, String... values) {
        return execute(script, operation, keys, values);
    }
    private <T> T execute(RedisScript<T> operationScript, String operation, List<String> keys, String... values) {
        if (!backoff.available()) throw new Unavailable();
        var arguments = new ArrayList<String>();
        arguments.add(operation);
        arguments.addAll(List.of(values));
        try {
            T value = redis.execute(operationScript, keys, arguments.toArray());
            if (value == null) throw new Unavailable();
            return value;
        } catch (RuntimeException failure) {
            backoff.failed(failure);
            throw new Unavailable();
        }
    }
}
