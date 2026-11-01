package kr.it.reserve.global.security.ip;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scripting.support.ResourceScriptSource;
import java.util.ArrayList;
import java.util.List;

class IpProtectionStore {
    static class Unavailable extends RuntimeException { }
    private final StringRedisTemplate redis;
    private final RedisFailureBackoff backoff;
    private final String prefix;
    private final DefaultRedisScript<Long> script = new DefaultRedisScript<>();

    IpProtectionStore(StringRedisTemplate redis, RedisNamespace namespace, RedisFailureBackoff backoff) {
        this.redis = redis;
        this.backoff = backoff;
        prefix = namespace.prefix() + "ip-protection:";
        script.setScriptSource(new ResourceScriptSource(new ClassPathResource("redis/ip-protection.lua")));
        script.setResultType(Long.class);
    }

    boolean known(String member, String network) { return call("known", List.of(key(member, "known")), network) == 1; }
    void remember(String member, String network) { call("remember", List.of(key(member, "known")), network); }
    void bind(String ticket, String binding) { call("bind", List.of(key(ticket, "challenge")), binding); }
    boolean binding(String ticket, String binding) { return call("binding", List.of(key(ticket, "challenge")), binding) == 1; }
    long issueCode(String ticket, String binding, String hash) { return call("issue-code", List.of(key(ticket, "challenge")), binding, hash); }
    boolean verifyCode(String ticket, String binding, String hash) { return call("verify-code", List.of(key(ticket, "challenge")), binding, hash) == 1; }
    long blocked(String network) { return call("blocked", List.of(key(network, "block"))); }
    void failed(String network) { call("failed", List.of(key(network, "failures"), key(network, "block"), key(network, "strikes"))); }

    private String key(String digest, String kind) { return prefix + "{" + digest + "}:" + kind; }
    private long call(String operation, List<String> keys, String... values) {
        if (!backoff.available()) throw new Unavailable();
        var arguments = new ArrayList<String>();
        arguments.add(operation);
        arguments.addAll(List.of(values));
        try {
            Long value = redis.execute(script, keys, arguments.toArray());
            if (value == null) throw new Unavailable();
            return value;
        } catch (RuntimeException failure) {
            backoff.failed(failure);
            throw new Unavailable();
        }
    }
}
