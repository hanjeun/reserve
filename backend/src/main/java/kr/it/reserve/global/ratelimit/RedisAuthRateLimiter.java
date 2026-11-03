package kr.it.reserve.global.ratelimit;

import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.scripting.support.ResourceScriptSource;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/** 공유 인증 제한은 저장소 장애를 로컬 허용으로 바꾸지 않는다. */
public final class RedisAuthRateLimiter {
    private static final EnumSet<RateLimiter.Policy> SHARED = EnumSet.of(RateLimiter.Policy.LOGIN, RateLimiter.Policy.LOGIN_ACCOUNT,
            RateLimiter.Policy.EMAIL_SEND, RateLimiter.Policy.SIGNUP, RateLimiter.Policy.LOGIN_METHOD_CHANGE,
            RateLimiter.Policy.LOGIN_METHOD_EMAIL, RateLimiter.Policy.LOGIN_METHOD_VERIFY, RateLimiter.Policy.CODE_VERIFY,
            RateLimiter.Policy.CODE_VERIFY_ACCOUNT, RateLimiter.Policy.OAUTH_START,
            RateLimiter.Policy.MEMBER_UPDATE, RateLimiter.Policy.MEMBER_UPDATE_IP);
    private static final EnumSet<RateLimiter.Policy> REFUNDABLE = EnumSet.of(RateLimiter.Policy.LOGIN_ACCOUNT, RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
    public static final class Unavailable extends AuthException {
        private final int retrySeconds;
        public Unavailable(int retrySeconds) {
            super("보안 확인을 준비하고 있어요. 잠시 후 다시 시도해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
            this.retrySeconds = Math.max(1, Math.min(600, retrySeconds));
        }
        public int retrySeconds() { return retrySeconds; }
    }
    public record Receipt(String bucket, String token, int capacity, long period) {
        @Override public String toString() { return "Receipt[redacted]"; }
    }
    public record Consumption(boolean allowed, Receipt receipt) { }
    private final StringRedisTemplate redis;
    private final RedisFailureBackoff backoff;
    private final DefaultRedisScript<Long> script = new DefaultRedisScript<>();
    private final byte[] key;
    private final String prefix;

    public RedisAuthRateLimiter(StringRedisTemplate redis, RedisNamespace namespace, RedisFailureBackoff backoff,
            AuthRateLimitProperties properties) {
        this.redis = redis; this.backoff = backoff;
        try { key = Base64.getDecoder().decode(properties.getFingerprintKey()); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Authentication limits require a dedicated base64 key"); }
        if (key.length != 32 || properties.getEpoch() == null || !properties.getEpoch().matches("[a-zA-Z0-9_-]{8,64}"))
            throw new IllegalArgumentException("Authentication limits require a dedicated 32-byte key and versioned epoch");
        prefix = namespace.prefix() + "auth-limits:v1:{" + digest("epoch", properties.getEpoch()) + "}:";
        script.setScriptSource(new ResourceScriptSource(new ClassPathResource("redis/auth-rate-limit.lua")));
        script.setResultType(Long.class);
    }
    public boolean supports(RateLimiter.Policy policy) { return SHARED.contains(policy); }
    public boolean refundable(RateLimiter.Policy policy) { return REFUNDABLE.contains(policy); }
    public Consumption consume(String subject, RateLimiter.Policy policy) {
        if (!supports(policy) || subject == null || subject.length() > 512) throw new IllegalArgumentException("Unsupported authentication limit");
        String bucket = prefix + policy.name() + ":" + digest("subject", subject);
        String token = prefix + "receipt:" + UUID.randomUUID();
        boolean refundable = refundable(policy);
        long value = call("consume", bucket, token, policy.capacity(), policy.refillDuration.toMillis(), refundable);
        return new Consumption(value == 1, value == 1 && refundable ? new Receipt(bucket, token, policy.capacity(), policy.refillDuration.toMillis()) : null);
    }
    public void refund(Receipt receipt) {
        if (receipt == null || !receipt.bucket().startsWith(prefix) || !receipt.token().startsWith(prefix)) return;
        call("refund", receipt.bucket(), receipt.token(), receipt.capacity(), receipt.period(), true);
    }
    private long call(String mode, String bucket, String token, int capacity, long period, boolean refundable) {
        if (!backoff.available()) throw new Unavailable(10);
        Long result;
        try {
            result = redis.execute(script, List.of(prefix + "state", bucket, token), mode, String.valueOf(capacity),
                    String.valueOf(period), refundable ? "1" : "0");
            if (result == null || result > 1 || result < -600) throw new IllegalStateException("Invalid shared authentication limit result");
        } catch (RuntimeException failure) {
            backoff.failed(failure);
            throw new Unavailable(10);
        }
        if (result < 0) throw new Unavailable((int) -result);
        return result;
    }
    private String digest(String purpose, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException impossible) { throw new IllegalStateException("HMAC-SHA256 is required", impossible); }
    }
}
