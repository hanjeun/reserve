package kr.it.reserve.config.updates;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/** Entity updates own relay registration and its publisher shutdown. */
@Configuration(proxyBeanMethods = false)
@Profile({"local & !prod & !blue & !green", "!local & (prod | blue | green)"})
@ConditionalOnProperty(prefix = "reserve.redis", name = "enabled", havingValue = "true")
public class EntityUpdateRedisConfiguration {
    @Bean(destroyMethod = "close")
    RedisEntityUpdateRelay redisEntityUpdateRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
            ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback, RedisNamespace namespace,
            @Value("${reserve.redis.password:}") String password) {
        return new RedisEntityUpdateRelay(redis, container, mapper, events, fallback, namespace, password);
    }
}
