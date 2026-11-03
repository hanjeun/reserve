package kr.it.reserve.global.ratelimit;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthRateLimitProperties.class)
@ConditionalOnProperty(prefix = "reserve.security.auth-limits", name = "enabled", havingValue = "true")
public class AuthRateLimitConfiguration {
    @Bean
    RedisAuthRateLimiter redisAuthRateLimiter(StringRedisTemplate redis, RedisNamespace namespace,
            RedisFailureBackoff backoff, AuthRateLimitProperties properties) {
        return new RedisAuthRateLimiter(redis, namespace, backoff, properties);
    }
}
