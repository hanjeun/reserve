package kr.it.reserve.global;

import kr.it.reserve.global.redis.LocalRedisConfiguration;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.config.updates.RedisEntityUpdateRelay;
import kr.it.reserve.config.updates.EntityUpdateRedisConfiguration;
import kr.it.reserve.global.ratelimit.RedisRequestLimiter;
import kr.it.reserve.waiting.service.RedisWaitingRelay;
import kr.it.reserve.waiting.config.WaitingRedisConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import kr.it.reserve.ReserveApplication;

import static org.assertj.core.api.Assertions.assertThat;

class RedisLocalBoundaryTest {
    private static final String PASSWORD = "synthetic-redis-boundary-password-at-least-32-characters";
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(LocalRedisConfiguration.class, WaitingRedisConfiguration.class,
                    EntityUpdateRedisConfiguration.class).withBean(ObjectMapper.class, () -> new ObjectMapper());

    @Test
    void localAndProductionAreDisabledByDefaultAndByExplicitFalse() {
        for (String profiles : new String[]{"local", "green", "blue", "prod"}) {
            for (String enabled : new String[]{"", "reserve.redis.enabled=false"}) {
                var candidate = context.withPropertyValues("spring.profiles.active=" + profiles);
                if (!enabled.isEmpty()) candidate = candidate.withPropertyValues(enabled);
                candidate.run(app -> {
                    assertThat(app).doesNotHaveBean(RedisConnectionFactory.class);
                    assertThat(app).doesNotHaveBean(RedisMessageListenerContainer.class);
                    assertThat(app).doesNotHaveBean(RedisRequestLimiter.class);
                    assertThat(app).doesNotHaveBean(RedisWaitingRelay.class);
                    assertThat(app).doesNotHaveBean(RedisEntityUpdateRelay.class);
                });
            }
        }
    }

    @Test
    void mixedProfilesCannotAccidentallyEnableLocalOrProductionRedis() {
        for (String profiles : new String[]{"local,green", "local,blue", "local,prod"}) {
            context.withPropertyValues("spring.profiles.active=" + profiles, "reserve.redis.enabled=true",
                    "reserve.redis.host=redis", "reserve.redis.password=" + PASSWORD).run(app -> {
                assertThat(app).doesNotHaveBean(RedisConnectionFactory.class);
                assertThat(app).doesNotHaveBean(RedisMessageListenerContainer.class);
                assertThat(app).doesNotHaveBean(RedisRequestLimiter.class);
                assertThat(app).doesNotHaveBean(RedisWaitingRelay.class);
                assertThat(app).doesNotHaveBean(RedisEntityUpdateRelay.class);
            });
        }
    }

    @Test
    void localKeepsItsLoopbackDefaultAndNamespace() {
        context.withPropertyValues("spring.profiles.active=local", "reserve.redis.enabled=true",
                "reserve.redis.password=" + PASSWORD).run(app -> {
            assertThat(app).hasNotFailed();
            assertThat(app.getBean(LettuceConnectionFactory.class).getHostName()).isEqualTo("127.0.0.1");
            assertThat(app.getBean(RedisNamespace.class)).isEqualTo(RedisNamespace.LOCAL);
            assertThat(app).hasSingleBean(RedisRequestLimiter.class).hasSingleBean(RedisWaitingRelay.class)
                    .hasSingleBean(RedisEntityUpdateRelay.class);
        });
        context.withPropertyValues("spring.profiles.active=local", "reserve.redis.enabled=true",
                "reserve.redis.host=10.0.0.1", "reserve.redis.password=" + PASSWORD).run(app -> assertThat(app).hasFailed());
    }

    @Test
    void explicitProductionOptInUsesTheSharedProductionNamespaceAndInternalEndpoint() {
        for (String profile : new String[]{"green", "blue", "prod"}) {
            context.withPropertyValues("spring.profiles.active=" + profile, "reserve.redis.enabled=true",
                    "reserve.redis.host=redis", "reserve.redis.password=" + PASSWORD,
                    "reserve.redis.username=reserve-app").run(app -> {
                assertThat(app).hasNotFailed();
                assertThat(app.getBean(RedisNamespace.class)).isEqualTo(RedisNamespace.PRODUCTION);
                assertThat(app.getBean(LettuceConnectionFactory.class).getHostName()).isEqualTo("redis");
                assertThat(app).hasSingleBean(RedisConnectionFactory.class).hasSingleBean(RedisRequestLimiter.class)
                        .hasSingleBean(RedisWaitingRelay.class).hasSingleBean(RedisEntityUpdateRelay.class);
            });
        }
        context.withPropertyValues("spring.profiles.active=prod", "reserve.redis.enabled=true",
                "reserve.redis.host=172.18.0.4", "reserve.redis.password=" + PASSWORD)
                .run(app -> assertThat(app).hasNotFailed());
    }

    @Test
    void productionRejectsImplicitLoopbackPublicAndMalformedEndpointsOrWeakCredentials() {
        for (String host : new String[]{"", "127.0.0.1", "localhost", "::1", "52.78.162.89", "8.8.8.8",
                "reserve.it.kr", "172.15.0.1", "172.32.0.1", "10.999.0.1", "10.00.0.1", "redis:6379"}) {
            context.withPropertyValues("spring.profiles.active=prod", "reserve.redis.enabled=true",
                    "reserve.redis.host=" + host, "reserve.redis.password=" + PASSWORD).run(app -> assertThat(app).hasFailed());
        }
        for (String invalid : new String[]{"reserve.redis.password=short", "reserve.redis.password=",
                "reserve.redis.port=0", "reserve.redis.port=65536"}) {
            context.withPropertyValues("spring.profiles.active=prod", "reserve.redis.enabled=true",
                    "reserve.redis.host=redis", "reserve.redis.password=" + PASSWORD)
                    .withPropertyValues(invalid).run(app -> assertThat(app).hasFailed());
        }
    }

    @Test
    void manualConnectionAndTemplateDoNotDuplicateSpringRedisAutoConfiguration() {
        context.withConfiguration(AutoConfigurations.of(DataRedisAutoConfiguration.class))
                .withPropertyValues("spring.profiles.active=prod", "reserve.redis.enabled=true",
                        "reserve.redis.host=redis", "reserve.redis.password=" + PASSWORD).run(app -> {
                    assertThat(app).hasNotFailed();
                    assertThat(app).hasSingleBean(RedisConnectionFactory.class).hasSingleBean(StringRedisTemplate.class);
                });
        assertThat(ReserveApplication.class.getAnnotation(SpringBootApplication.class).exclude())
                .contains(DataRedisAutoConfiguration.class, DataRedisRepositoriesAutoConfiguration.class);
    }
}
