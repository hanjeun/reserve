package kr.it.reserve.global.ratelimit;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.core.StringRedisTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

class AuthRateLimitConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(AuthRateLimitConfiguration.class);
    @Test void disabledNeedsNoRedisKeyOrEpoch() {
        context.run(application -> assertThat(application).hasNotFailed().doesNotHaveBean(RedisAuthRateLimiter.class));
    }
    @Test void enabledNeverSilentlyFallsBackWhenRedisIsAbsent() {
        context.withPropertyValues("reserve.security.auth-limits.enabled=true").run(application -> assertThat(application).hasFailed());
    }
    @Test void explicitEnableNeedsBothADedicatedKeyAndVersionedEpoch() {
        var redis = context.withBean(StringRedisTemplate.class, () -> mock(StringRedisTemplate.class))
                .withBean(RedisNamespace.class, () -> RedisNamespace.LOCAL).withBean(RedisFailureBackoff.class, RedisFailureBackoff::new)
                .withPropertyValues("reserve.security.auth-limits.enabled=true");
        redis.run(application -> assertThat(application).hasFailed());
        redis.withPropertyValues("reserve.security.auth-limits.fingerprint-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
                .run(application -> assertThat(application).hasFailed());
        redis.withPropertyValues("reserve.security.auth-limits.fingerprint-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "reserve.security.auth-limits.epoch=synthetic-v1").run(application -> assertThat(application).hasNotFailed().hasSingleBean(RedisAuthRateLimiter.class));
    }
}
