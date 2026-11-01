package kr.it.reserve.global.security.ip;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(IpProtectionProperties.class)
public class IpProtectionConfiguration {
    @Bean
    @ConditionalOnProperty(prefix = "reserve.security.ip-protection", name = "enabled", havingValue = "true")
    IpProtectionStore ipProtectionStore(StringRedisTemplate redis, RedisNamespace namespace, RedisFailureBackoff backoff,
            IpProtectionProperties properties, @Value("${reserve.redis.username:}") String username) {
        if (namespace == RedisNamespace.PRODUCTION && (!"reserve_app".equals(username)
                || properties.getTrustedProxies().isEmpty() || properties.getTrustedProxies().stream()
                .anyMatch(proxy -> !(proxy.endsWith("/32") || proxy.endsWith("/128"))))) {
            throw new IllegalArgumentException("Production IP protection requires the restricted Redis user and individual proxy addresses");
        }
        return new IpProtectionStore(redis, namespace, backoff);
    }

    @Bean
    IpLoginProtection ipLoginProtection(IpProtectionProperties properties, ObjectProvider<IpProtectionStore> store) {
        return new IpLoginProtection(properties, store.getIfAvailable());
    }
}
