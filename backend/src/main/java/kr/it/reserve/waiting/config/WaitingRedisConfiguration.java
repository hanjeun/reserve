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

/** Waiting owns its relay; shared Redis infrastructure has no waiting dependency. */
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
