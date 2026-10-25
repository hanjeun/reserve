package kr.it.reserve.waiting.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.waiting.service.RedisWaitingRelay;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/** 웨이팅 모듈이 릴레이를 소유하며 공통 Redis 기반은 웨이팅에 의존하지 않는다. */
@Configuration(proxyBeanMethods = false)
@Profile({"local & !prod & !blue & !green", "!local & (prod | blue | green)"})
@ConditionalOnProperty(prefix = "reserve.redis", name = "enabled", havingValue = "true")
public class WaitingRedisConfiguration {
    @Bean
    RedisWaitingRelay redisWaitingRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
            ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback, RedisNamespace namespace) {
        return new RedisWaitingRelay(redis, container, mapper, events, fallback, namespace);
    }
}
