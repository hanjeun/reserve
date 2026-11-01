package kr.it.reserve.global.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterCapacityTest {
    @Test void keyChurnCannotAllocatePastTheCapOrResetAnActiveLimit() {
        var limiter = new RateLimiter(2);
        for (int i = 0; i < RateLimiter.Policy.LOGIN_ACCOUNT.capacity(); i++)
            assertThat(limiter.tryConsume("member-a", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        assertThat(limiter.tryConsume("member-b", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        for (int i = 0; i < 100; i++) assertThat(limiter.tryConsume("new-" + i, RateLimiter.Policy.LOGIN_ACCOUNT)).isFalse();
        limiter.refund("not-stored", RateLimiter.Policy.LOGIN_ACCOUNT);
        limiter.evictIdleBuckets();
        assertThat(limiter.tryConsume("member-a", RateLimiter.Policy.LOGIN_ACCOUNT)).isFalse();
        assertThat(limiter.tryConsume("member-b", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        assertThat(buckets(limiter)).hasSize(2);
    }

    @Test void concurrentNewKeysRespectTheSameHardCap() throws Exception {
        var limiter = new RateLimiter(8);
        try (var pool = Executors.newFixedThreadPool(12)) {
            var start = new CountDownLatch(1);
            var results = new ArrayList<Future<Boolean>>();
            for (int i = 0; i < 48; i++) {
                String key = "synthetic-" + i;
                results.add(pool.submit(() -> { start.await(); return limiter.tryConsume(key, RateLimiter.Policy.EMAIL_SEND); }));
            }
            start.countDown();
            int allowed = 0;
            for (var result : results) if (result.get(10, TimeUnit.SECONDS)) allowed++;
            assertThat(allowed).isEqualTo(8);
            assertThat(buckets(limiter)).hasSize(8);
        }
    }

    @Test void expiredIdleKeysMakeRoomWithoutEvictingActiveUsers() {
        var limiter = new RateLimiter(2);
        limiter.tryConsume("idle", RateLimiter.Policy.EMAIL_SEND);
        limiter.tryConsume("active", RateLimiter.Policy.EMAIL_SEND);
        Object idle = buckets(limiter).get("EMAIL_SEND:idle");
        ((AtomicLong) ReflectionTestUtils.getField(idle, "lastAccessMs")).set(System.currentTimeMillis() - Duration.ofMinutes(31).toMillis());
        limiter.evictIdleBuckets();
        assertThat(limiter.tryConsume("new", RateLimiter.Policy.EMAIL_SEND)).isTrue();
        assertThat(buckets(limiter).containsKey("EMAIL_SEND:active")).isTrue();
        assertThat(buckets(limiter)).hasSize(2);
    }

    private Map<?, ?> buckets(RateLimiter limiter) { return (Map<?, ?>) ReflectionTestUtils.getField(limiter, "buckets"); }
}
