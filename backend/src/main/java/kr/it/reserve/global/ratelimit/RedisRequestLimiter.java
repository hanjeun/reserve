package kr.it.reserve.global.ratelimit;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scripting.support.ResourceScriptSource;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;

public class RedisRequestLimiter {
    private final StringRedisTemplate redis;
    private final RedisFailureBackoff fallback;
    private final DefaultRedisScript<Long> script;
    private final RedisNamespace namespace;

    public RedisRequestLimiter(StringRedisTemplate redis, RedisFailureBackoff fallback) {
        this(redis, fallback, RedisNamespace.LOCAL);
    }

    public RedisRequestLimiter(StringRedisTemplate redis, RedisFailureBackoff fallback, RedisNamespace namespace) {
        this.redis = redis;
        this.fallback = fallback;
        this.namespace = namespace;
        script = new DefaultRedisScript<>();
        script.setScriptSource(new ResourceScriptSource(new ClassPathResource("redis/request-limit.lua")));
        script.setResultType(Long.class);
    }

    /** null은 Redis 장애다. 호출자는 이미 소비한 로컬 제한을 그대로 유지한다. */
    public Boolean tryConsume(String subject, RateLimiter.Policy policy, int capacity, Duration refill) {
        if (!fallback.available()) return null;
        String key = namespace.prefix() + "limits:" + policy.name() + ":" + digest(subject);
        try {
            Long result = redis.execute(script, List.of(key), String.valueOf(capacity), String.valueOf(refill.toMillis()));
            if (result == null || (result != 0 && result != 1)) throw new IllegalStateException("Invalid Redis rate limit result");
            return result == 1;
        } catch (RuntimeException unavailable) {
            fallback.failed(unavailable);
            return null;
        }
    }

    private static String digest(String subject) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(String.valueOf(subject).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 is required", impossible); }
    }
}
