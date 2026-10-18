package kr.it.reserve.global;

import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.RedisRequestLimiter;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import io.lettuce.core.resource.DefaultClientResources;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RedisWaitingLimitTest {
    @Test
    void anUnresponsiveLocalEndpointUsesFiniteFallbackWithoutTouchingTheRunningRedis() throws Exception {
        // 자체 loopback 소켓은 Redis 응답을 보내지 않는다. 실제 프리뷰 컨테이너와 데이터는 건드리지 않는다.
        var resources = DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        try (var endpoint = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            var server = new RedisStandaloneConfiguration("127.0.0.1", endpoint.getLocalPort());
            var client = LettuceClientConfiguration.builder().clientResources(resources)
                    .commandTimeout(Duration.ofMillis(250)).shutdownTimeout(Duration.ofMillis(100)).build();
            var connection = new LettuceConnectionFactory(server, client);
            try {
                connection.afterPropertiesSet(); connection.start();
                var template = new StringRedisTemplate(connection);
                var backoff = new RedisFailureBackoff();
                var shared = new RedisRequestLimiter(template, backoff);
                var limiter = new RateLimiter();
                ReflectionTestUtils.setField(limiter, "sharedWaitingLimits", shared);
                for (int i = 0; i < RateLimiter.Policy.WAITING_JOIN.capacity(); i++) {
                    assertThat(limiter.tryConsume("synthetic-outage", RateLimiter.Policy.WAITING_JOIN)).isTrue();
                }
                assertThat(limiter.tryConsume("synthetic-outage", RateLimiter.Policy.WAITING_JOIN)).isFalse();
                assertThat(backoff.available()).isFalse();
            } finally { connection.destroy(); }
        } finally { resources.shutdown().syncUninterruptibly(); }
    }

    @Test
    void sharedDenialDoesNotDrainLocalFallbackAndOutageStillHasAFiniteLimit() {
        RedisRequestLimiter shared = mock(RedisRequestLimiter.class);
        RateLimiter limiter = new RateLimiter();
        ReflectionTestUtils.setField(limiter, "sharedWaitingLimits", shared);
        when(shared.tryConsume(anyString(), eq(RateLimiter.Policy.WAITING_JOIN), anyInt(), any()))
                .thenReturn(false, (Boolean) null);
        assertThat(limiter.tryConsume("member-7", RateLimiter.Policy.WAITING_JOIN)).isFalse();
        for (int i = 0; i < RateLimiter.Policy.WAITING_JOIN.capacity(); i++) {
            assertThat(limiter.tryConsume("member-7", RateLimiter.Policy.WAITING_JOIN)).isTrue();
        }
        assertThat(limiter.tryConsume("member-7", RateLimiter.Policy.WAITING_JOIN)).isFalse();
        assertThat(limiter.tryConsume("member-8", RateLimiter.Policy.WAITING_JOIN)).isTrue();
    }

    @Test
    void waitingRedisDoesNotChangeLoginOrChatPolicies() {
        RedisRequestLimiter shared = mock(RedisRequestLimiter.class);
        RateLimiter limiter = new RateLimiter();
        ReflectionTestUtils.setField(limiter, "sharedWaitingLimits", shared);
        assertThat(limiter.tryConsume("member-7", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        limiter.refund("member-7", RateLimiter.Policy.LOGIN_ACCOUNT);
        assertThat(limiter.tryConsume("member-7", RateLimiter.Policy.CHAT_SEND)).isTrue();
        verifyNoInteractions(shared);
    }
}
