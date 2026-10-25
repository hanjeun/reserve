package kr.it.reserve.global.redis;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.resource.ClientResources;
import io.lettuce.core.resource.DefaultClientResources;
import kr.it.reserve.global.ratelimit.RedisRequestLimiter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.ThreadPoolExecutor;

/** Redis 연결은 명시적인 활성 설정에서만 준비한다. */
@Configuration(proxyBeanMethods = false)
@Profile({"local & !prod & !blue & !green", "!local & (prod | blue | green)"})
@ConditionalOnProperty(prefix = "reserve.redis", name = "enabled", havingValue = "true")
public class LocalRedisConfiguration {
    public static final String KEY_PREFIX = RedisNamespace.LOCAL.prefix();

    @Bean
    RedisNamespace redisNamespace(Environment environment) {
        return environment.acceptsProfiles(Profiles.of("prod | blue | green"))
                ? RedisNamespace.PRODUCTION : RedisNamespace.LOCAL;
    }

    @Bean
    RedisFailureBackoff redisFailureBackoff() { return new RedisFailureBackoff(); }

    @Bean
    RedisRequestLimiter redisRequestLimiter(StringRedisTemplate redis, RedisFailureBackoff fallback, RedisNamespace namespace) {
        return new RedisRequestLimiter(redis, fallback, namespace);
    }

    @Bean(destroyMethod = "shutdown")
    ClientResources reserveRedisClientResources() {
        return DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
    }

    @Bean
    LettuceConnectionFactory redisConnectionFactory(ClientResources resources, RedisNamespace namespace,
            @Value("${reserve.redis.host:}") String configuredHost,
            @Value("${reserve.redis.port:6379}") int port,
            @Value("${reserve.redis.password:}") String password,
            @Value("${reserve.redis.username:}") String username) {
        String host = configuredHost == null ? "" : configuredHost;
        if (namespace == RedisNamespace.LOCAL && host.isEmpty()) host = "127.0.0.1";
        boolean validHost = namespace == RedisNamespace.LOCAL
                ? Set.of("127.0.0.1", "localhost", "::1").contains(host) : internalProductionHost(host);
        if (!validHost || port < 1 || port > 65535 || password == null || password.isBlank() || password.length() < 32) {
            throw new IllegalArgumentException("Redis requires an environment-scoped endpoint, valid port and dedicated password");
        }
        RedisStandaloneConfiguration server = new RedisStandaloneConfiguration(host, port);
        server.setPassword(password);
        if (username != null && !username.isBlank()) server.setUsername(username);
        Duration timeout = Duration.ofMillis(250);
        var options = ClientOptions.builder().requestQueueSize(128)
                .socketOptions(SocketOptions.builder().connectTimeout(timeout).build()).build();
        var client = LettuceClientConfiguration.builder().clientResources(resources).clientOptions(options)
                .commandTimeout(timeout).shutdownTimeout(Duration.ofMillis(100)).build();
        return new LettuceConnectionFactory(server, client);
    }

    private static boolean internalProductionHost(String host) {
        if ("redis".equals(host)) return true;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int index = 0; index < parts.length; index++) {
            if (!parts[index].matches("0|[1-9][0-9]{0,2}")) return false;
            octets[index] = Integer.parseInt(parts[index]);
            if (octets[index] > 255) return false;
        }
        return octets[0] == 10 || octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31
                || octets[0] == 192 && octets[1] == 168;
    }

    @Bean
    StringRedisTemplate redisTemplate(LettuceConnectionFactory factory) { return new StringRedisTemplate(factory); }

    @Bean
    ThreadPoolTaskExecutor waitingRedisExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(128);
        executor.setThreadNamePrefix("waiting-redis-");
        // 갱신 신호는 원문이 아니다. 과부하 때 오래된 신호는 기존 조회·폴링으로 복구한다.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.DiscardOldestPolicy());
        return executor;
    }

    @Bean
    ThreadPoolTaskExecutor waitingRedisSubscriptionExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(1);
        executor.setThreadNamePrefix("waiting-redis-subscribe-");
        return executor;
    }

    @Bean
    RedisMessageListenerContainer waitingRedisContainer(LettuceConnectionFactory factory,
            @Qualifier("waitingRedisExecutor") ThreadPoolTaskExecutor executor,
            @Qualifier("waitingRedisSubscriptionExecutor") ThreadPoolTaskExecutor subscription,
            RedisFailureBackoff fallback) {
        var container = new RedisMessageListenerContainer() {
            @Override public boolean isAutoStartup() { return false; }
        };
        container.setConnectionFactory(factory);
        container.setTaskExecutor(executor);
        container.setSubscriptionExecutor(subscription);
        container.setRecoveryInterval(5_000);
        container.setMaxSubscriptionRegistrationWaitingTime(1_000);
        container.setErrorHandler(fallback::failed);
        // 최초 연결 실패가 앱 시작을 막지 않게 ready 이후 연결하고 주기적으로 재시도한다.
        return container;
    }
}
