package com.reserve.global.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * IP 기반 Rate Limiter (in-memory, Bucket4j)
 *
 * 엔드포인트별 정책:
 *  - LOGIN      : 10분에 10회
 *  - EMAIL_SEND : 10분에 5회 (이메일 발송 비용 고려)
 */
@Component
public class RateLimiter {

    public enum Policy {
        LOGIN(10, Duration.ofMinutes(10)),
        EMAIL_SEND(5, Duration.ofMinutes(10));

        final int capacity;
        final Duration refillDuration;

        Policy(int capacity, Duration refillDuration) {
            this.capacity = capacity;
            this.refillDuration = refillDuration;
        }
    }

    // key = "POLICY_NAME:IP주소"
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * 요청 허용 여부 확인. false 반환 시 컨트롤러에서 429 응답해야 함.
     */
    public boolean tryConsume(String ip, Policy policy) {
        Bucket bucket = buckets.computeIfAbsent(
                policy.name() + ":" + ip,
                k -> newBucket(policy)
        );
        return bucket.tryConsume(1);
    }

    private Bucket newBucket(Policy policy) {
        Bandwidth limit = Bandwidth.builder()
                .capacity(policy.capacity)
                .refillIntervally(policy.capacity, policy.refillDuration)
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
