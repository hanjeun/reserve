package kr.it.reserve.waiting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.RedisRequestLimiter;
import kr.it.reserve.global.redis.LocalRedisConfiguration;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.config.updates.UpdateStreamAccess;
import kr.it.reserve.config.updates.EntityUpdateRedisConfiguration;
import kr.it.reserve.waiting.config.WaitingRedisConfiguration;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.MapPropertySource;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 명시적으로 켠 경우에만 일회성 Redis를 사용하며 앱 Redis나 자격정보는 재사용하지 않는다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_REDIS_INTEGRATION", matches = "true")
@Timeout(30)
class RedisSharedBoundaryIntegrationTest {
    private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
    private static final String NAME = System.getenv().getOrDefault("RESERVE_REDIS_TEST_CONTAINER",
            "reserve-redis-audit-" + UUID.randomUUID().toString().substring(0, 8));
    private static final String PASSWORD = UUID.randomUUID() + UUID.randomUUID().toString();
    private static boolean owned;
    private static AnnotationConfigApplicationContext first;
    private static AnnotationConfigApplicationContext second;

    @BeforeAll
    static void startDisposableRedis() throws Exception {
        assertThat(NAME).matches("reserve-redis-audit-[a-z0-9-]+");
        // 영속·익명 볼륨, 공개 연결 주소, 비밀번호가 포함된 명령행 인수를 사용하지 않는다.
        command(null, "run", "--pull=never", "-d", "--name", NAME,
                "--user", "999:999", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=64",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "-p", "127.0.0.1::6379", IMAGE, "sh", "-c",
                "while [ ! -f /tmp/redis-test.conf ]; do sleep 0.1; done; exec redis-server /tmp/redis-test.conf");
        owned = true;
        String config = "bind 0.0.0.0\nprotected-mode yes\nport 6379\nrequirepass " + PASSWORD
                + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n";
        command(config, "exec", "-i", NAME, "sh", "-c",
                "umask 077; cat > /tmp/redis-test.next && mv /tmp/redis-test.next /tmp/redis-test.conf");
        String port = command(null, "port", NAME, "6379/tcp").trim();
        assertThat(port).matches("127\\.0\\.0\\.1:[0-9]+");
        int number = Integer.parseInt(port.substring(port.lastIndexOf(':') + 1));
        first = context(number);
        second = context(number);
        assertThat(first.getBean(StringRedisTemplate.class).getConnectionFactory())
                .isNotSameAs(second.getBean(StringRedisTemplate.class).getConnectionFactory());
        assertThat(first.getBean(StringRedisTemplate.class).getConnectionFactory()).isNotNull();
        awaitPing(first.getBean(RedisConnectionFactory.class));
    }

    @AfterAll
    static void stopOnlyOwnedContainer() throws Exception {
        try {
            if (first != null) first.close();
            if (second != null) second.close();
        } finally {
            if (owned) command(null, "rm", "-f", NAME);
        }
    }

    @Test
    void independentLimitersShareOneAtomicBudgetThroughSeparateRedisConnections() throws Exception {
        RateLimiter left = limiter(first);
        RateLimiter right = limiter(second);
        int capacity = RateLimiter.Policy.WAITING_JOIN.capacity();
        String subject = "synthetic-shared-" + UUID.randomUUID();
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var one = workers.submit(() -> consume(left, subject, capacity, start));
            var two = workers.submit(() -> consume(right, subject, capacity, start));
            start.countDown();
            assertThat(one.get(10, TimeUnit.SECONDS) + two.get(10, TimeUnit.SECONDS)).isEqualTo(capacity);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void realRelayScopesRecipientsSkipsItsOwnSignalAndRecoversAfterSubscriptionLoss() throws Exception {
        SseEmitter recipient = mock(SseEmitter.class);
        SseEmitter outsider = mock(SseEmitter.class);
        SseEmitter originatingNode = mock(SseEmitter.class);
        Map<SseEmitter, UpdateStreamAccess.Identity> firstSubscribers = (Map<SseEmitter, UpdateStreamAccess.Identity>) ReflectionTestUtils.getField(
                first.getBean(WaitingEventStream.class), "subscribers");
        Map<SseEmitter, UpdateStreamAccess.Identity> secondSubscribers = (Map<SseEmitter, UpdateStreamAccess.Identity>) ReflectionTestUtils.getField(
                second.getBean(WaitingEventStream.class), "subscribers");
        firstSubscribers.put(originatingNode, identity(7L));
        secondSubscribers.put(recipient, identity(7L));
        secondSubscribers.put(outsider, identity(99L));
        RedisWaitingRelay publisher = first.getBean(RedisWaitingRelay.class);
        RedisWaitingRelay subscriber = second.getBean(RedisWaitingRelay.class);
        publisher.reconnect();
        subscriber.reconnect();
        publisher.publish(new WaitingEventPublisher.Changed(31L, Set.of(7L)));
        verify(recipient, timeout(5_000)).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(outsider, originatingNode);

        var receiver = second.getBean(RedisMessageListenerContainer.class);
        receiver.stop();
        assertThat(receiver.isRunning()).isFalse();
        clearInvocations(recipient);
        publisher.publish(new WaitingEventPublisher.Changed(32L, Set.of(7L)));
        verify(recipient, after(250).never()).send(any(SseEmitter.SseEventBuilder.class));
        subscriber.reconnect();
        verify(recipient, after(250).never()).send(any(SseEmitter.SseEventBuilder.class));
        publisher.publish(new WaitingEventPublisher.Changed(33L, Set.of(7L)));
        var signal = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(recipient, timeout(5_000)).send(signal.capture());
        assertThat(signal.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData)
                .filter(Map.class::isInstance).toList()).containsExactly(Map.of("storeId", 33L));
        verifyNoInteractions(outsider, originatingNode);
    }

    @Test
    @SuppressWarnings("unchecked")
    void localAndProductionNamespacesIsolateActualBudgetsAndPubSubOnTheSameRedis() throws Exception {
        var redis = first.getBean(StringRedisTemplate.class);
        var fallback = first.getBean(RedisFailureBackoff.class);
        var local = first.getBean(RedisRequestLimiter.class);
        var production = new RedisRequestLimiter(redis, fallback, RedisNamespace.PRODUCTION);
        String subject = "synthetic-isolation-" + UUID.randomUUID();
        for (var limiter : new RedisRequestLimiter[]{local, production}) {
            assertThat(limiter.tryConsume(subject, RateLimiter.Policy.WAITING_JOIN, 1, Duration.ofMinutes(1))).isTrue();
            assertThat(limiter.tryConsume(subject, RateLimiter.Policy.WAITING_JOIN, 1, Duration.ofMinutes(1))).isFalse();
        }
        var productionEvents = mock(ApplicationEventPublisher.class);
        var container = second.getBean(RedisMessageListenerContainer.class);
        var productionSubscriber = new RedisWaitingRelay(second.getBean(StringRedisTemplate.class), container,
                new ObjectMapper(), productionEvents, second.getBean(RedisFailureBackoff.class), RedisNamespace.PRODUCTION);
        var productionPublisher = new RedisWaitingRelay(redis, first.getBean(RedisMessageListenerContainer.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class), fallback, RedisNamespace.PRODUCTION);
        SseEmitter localRecipient = mock(SseEmitter.class);
        Map<SseEmitter, UpdateStreamAccess.Identity> subscribers = (Map<SseEmitter, UpdateStreamAccess.Identity>) ReflectionTestUtils.getField(
                second.getBean(WaitingEventStream.class), "subscribers");
        subscribers.put(localRecipient, identity(7L));
        productionSubscriber.register();
        try {
            first.getBean(RedisWaitingRelay.class).reconnect();
            second.getBean(RedisWaitingRelay.class).reconnect();
            productionPublisher.publish(new WaitingEventPublisher.Changed(41L, Set.of(7L)));
            verify(productionEvents, timeout(5_000)).publishEvent(new RedisWaitingRelay.RemoteChanged(41L, Set.of(7L)));
            verify(localRecipient, after(250).never()).send(any(SseEmitter.SseEventBuilder.class));
            clearInvocations(productionEvents);
            first.getBean(RedisWaitingRelay.class).publish(new WaitingEventPublisher.Changed(42L, Set.of(7L)));
            verify(localRecipient, timeout(5_000)).send(any(SseEmitter.SseEventBuilder.class));
            verifyNoInteractions(productionEvents);
        } finally {
            container.removeMessageListener(productionSubscriber);
            subscribers.remove(localRecipient);
        }
    }

    private static int consume(RateLimiter limiter, String subject, int attempts, CountDownLatch start) throws Exception {
        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
        int accepted = 0;
        for (int index = 0; index < attempts; index++) {
            if (limiter.tryConsume(subject, RateLimiter.Policy.WAITING_JOIN)) accepted++;
        }
        return accepted;
    }

    private static RateLimiter limiter(AnnotationConfigApplicationContext context) {
        var limiter = new RateLimiter();
        var shared = context.getBean(RedisRequestLimiter.class);
        ReflectionTestUtils.setField(limiter, "sharedWaitingLimits", shared);
        return limiter;
    }

    private static AnnotationConfigApplicationContext context(int port) {
        var context = new AnnotationConfigApplicationContext();
        context.getEnvironment().setActiveProfiles("local");
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("disposable-redis", Map.of(
                "reserve.redis.enabled", "true", "reserve.redis.host", "127.0.0.1",
                "reserve.redis.port", port, "reserve.redis.password", PASSWORD)));
        context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
        context.registerBean(UpdateStreamAccess.class, () -> {
            UpdateStreamAccess access = mock(UpdateStreamAccess.class);
            when(access.current(any())).thenAnswer(call -> identity(7L).equals(call.getArgument(0))
                    || identity(99L).equals(call.getArgument(0)));
            return access;
        });
        context.register(LocalRedisConfiguration.class, WaitingRedisConfiguration.class,
                EntityUpdateRedisConfiguration.class, WaitingEventStream.class);
        context.refresh();
        return context;
    }

    private static UpdateStreamAccess.Identity identity(long memberId) {
        return UpdateStreamAccess.waitingIdentity(Member.builder().id(memberId).role(Role.USER).termsAgreed(true).build(), null);
    }

    private static void awaitPing(RedisConnectionFactory factory) throws Exception {
        for (int attempt = 0; attempt < 40; attempt++) {
            try (var connection = factory.getConnection()) {
                if ("PONG".equals(connection.ping())) return;
            } catch (RuntimeException notReady) { /* 이 시험이 소유한 Redis만 기동을 기다린다. */ }
            Thread.sleep(50);
        }
        throw new IllegalStateException("Disposable Redis did not become ready");
    }

    private static String command(String stdin, String... arguments) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add("docker");
        command.addAll(java.util.List.of(arguments));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        try {
            if (stdin != null) process.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            if (!process.waitFor(15, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("Disposable Redis Docker command timed out");
            }
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable Redis Docker command failed: " + process.exitValue());
            return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } finally { process.destroy(); }
    }
}
