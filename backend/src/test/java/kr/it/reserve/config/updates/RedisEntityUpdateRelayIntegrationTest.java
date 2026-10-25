package kr.it.reserve.config.updates;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.redis.LocalRedisConfiguration;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.waiting.service.RedisWaitingRelay;
import kr.it.reserve.waiting.config.WaitingRedisConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static kr.it.reserve.config.updates.EntityUpdates.Domain.*;
import static kr.it.reserve.config.updates.EntityUpdates.Operation.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 앱 Redis와 분리된 일회성 로컬 연결 두 개를 사용한다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_REDIS_INTEGRATION", matches = "true")
@Timeout(30)
class RedisEntityUpdateRelayIntegrationTest {
    private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
    private static final String NAME = "reserve-entity-relay-audit-" + UUID.randomUUID().toString().substring(0, 8);
    private static final String PASSWORD = UUID.randomUUID() + UUID.randomUUID().toString();
    private static boolean owned;
    private static Node first;
    private static Node second;

    @BeforeAll
    static void startOnlyOwnedRedis() throws Exception {
        command(null, "run", "--pull=never", "-d", "--name", NAME,
                "--user", "999:999", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=64",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "-p", "127.0.0.1::6379", IMAGE, "sh", "-c",
                "while [ ! -f /tmp/redis-test.conf ]; do sleep 0.1; done; exec redis-server /tmp/redis-test.conf");
        owned = true;
        command("bind 0.0.0.0\nprotected-mode yes\nport 6379\nrequirepass " + PASSWORD
                        + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n",
                "exec", "-i", NAME, "sh", "-c", "umask 077; cat > /tmp/redis-test.next && mv /tmp/redis-test.next /tmp/redis-test.conf");
        String mapped = command(null, "port", NAME, "6379/tcp").trim();
        assertThat(mapped).matches("127\\.0\\.0\\.1:[0-9]+");
        int port = Integer.parseInt(mapped.substring(mapped.lastIndexOf(':') + 1));
        first = node(port);
        second = node(port);
        assertThat(first.context().getBean(StringRedisTemplate.class).getConnectionFactory())
                .isNotSameAs(second.context().getBean(StringRedisTemplate.class).getConnectionFactory());
        awaitPing(first.context().getBean(StringRedisTemplate.class));
        awaitPing(second.context().getBean(StringRedisTemplate.class));
        first.context().getBean(RedisWaitingRelay.class).reconnect();
        second.context().getBean(RedisWaitingRelay.class).reconnect();
        assertThat(first.subscribed().await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(second.subscribed().await(5, TimeUnit.SECONDS)).isTrue();
    }

    @AfterAll
    static void removeOnlyOwnedRedis() throws Exception {
        try {
            if (first != null) first.context().close();
            if (second != null) second.context().close();
        } finally { if (owned) command(null, "rm", "-f", NAME); }
    }

    @Test
    void committedRecipientUpdatesCrossConnectionsOnceAndReconnectRequiresFreshAuthorizedReads() throws Exception {
        var source = first.context().getBean(EntityUpdateStream.class);
        var destination = second.context().getBean(EntityUpdateStream.class);
        SseEmitter local = source.subscribe(EntityUpdateStreamTest.member(7, Role.USER));
        SseEmitter recipient = destination.subscribe(EntityUpdateStreamTest.member(7, Role.USER));
        SseEmitter outsider = destination.subscribe(EntityUpdateStreamTest.member(99, Role.USER));
        SseEmitter anonymous = destination.subscribePublic("127.0.0.1");
        clearInvocations(local, recipient, outsider, anonymous);
        var updates = first.context().getBean(EntityUpdates.class);
        Runnable notify = () -> updates.publish(NOTIFICATION, 17L, 11L, null, UPDATED, false, Set.of(7L), false);
        transaction(notify, false);
        verify(recipient, after(150).never()).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(local, outsider, anonymous);
        transaction(notify, true);
        verify(recipient, timeout(5_000)).send(any(SseEmitter.SseEventBuilder.class));
        verify(local, after(200).times(1)).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(outsider, anonymous);

        var container = second.context().getBean(RedisMessageListenerContainer.class);
        container.stop();
        clearInvocations(recipient, outsider, anonymous);
        transaction(notify, true);
        verify(recipient, after(200).never()).send(any(SseEmitter.SseEventBuilder.class));
        second.context().getBean(RedisWaitingRelay.class).reconnect();
        verify(recipient, timeout(5_000)).complete();
        verify(outsider, timeout(5_000)).complete();
        verify(anonymous, timeout(5_000)).complete();
        verify(recipient, never()).send(any(SseEmitter.SseEventBuilder.class));
        SseEmitter reconnected = destination.subscribe(EntityUpdateStreamTest.member(7, Role.USER));
        clearInvocations(reconnected);
        verify(reconnected, after(150).never()).send(any(SseEmitter.SseEventBuilder.class));
        transaction(notify, true);
        verify(reconnected, timeout(5_000)).send(any(SseEmitter.SseEventBuilder.class));
        var sent = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(reconnected).send(sent.capture());
        var signal = sent.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData)
                .filter(EntityUpdateStream.Signal.class::isInstance).map(EntityUpdateStream.Signal.class::cast).findFirst().orElseThrow();
        assertThat(signal.domain()).isEqualTo(NOTIFICATION);
        assertThat(signal.entityId()).isEqualTo(17L);
        assertThat(new ObjectMapper().writeValueAsString(signal)).doesNotContain("member", "audience", "token", PASSWORD);
    }

    private static Node node(int port) {
        var context = new AnnotationConfigApplicationContext();
        var subscribed = new CountDownLatch(1);
        context.getEnvironment().setActiveProfiles("local");
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("disposable-common-relay", Map.of(
                "reserve.redis.enabled", "true", "reserve.redis.host", "127.0.0.1",
                "reserve.redis.port", port, "reserve.redis.password", PASSWORD)));
        var access = mock(UpdateStreamAccess.class);
        when(access.current(any())).thenReturn(true);
        context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
        context.registerBean(UpdateStreamAccess.class, () -> access);
        context.registerBean(EntityUpdateStream.class, () -> new EntityUpdateStream(access, () -> mock(SseEmitter.class)));
        context.registerBean(EntityUpdates.class, () -> new EntityUpdates(context));
        context.registerBean(TransactionalEventListenerFactory.class);
        context.register(LocalRedisConfiguration.class, WaitingRedisConfiguration.class, EntityUpdateRedisConfiguration.class);
        context.refresh();
        context.addApplicationListener(event -> {
            if (event instanceof PayloadApplicationEvent<?> payload && payload.getPayload() instanceof RedisEntityUpdateRelay.Reconnected) {
                subscribed.countDown();
            }
        });
        return new Node(context, subscribed);
    }

    private static void transaction(Runnable work, boolean commit) {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            work.run();
            for (var synchronization : TransactionSynchronizationManager.getSynchronizations()) {
                if (commit) synchronization.afterCommit();
                synchronization.afterCompletion(commit ? TransactionSynchronization.STATUS_COMMITTED : TransactionSynchronization.STATUS_ROLLED_BACK);
            }
        } finally { TransactionSynchronizationManager.clear(); }
    }

    private static void awaitPing(StringRedisTemplate redis) throws Exception {
        for (int attempt = 0; attempt < 40; attempt++) {
            try (var connection = redis.getConnectionFactory().getConnection()) {
                if ("PONG".equals(connection.ping())) return;
            } catch (RuntimeException starting) { /* 이 시험이 소유한 Redis만 기동을 기다린다. */ }
            Thread.sleep(50);
        }
        throw new IllegalStateException("Disposable common relay Redis did not become ready");
    }

    private static String command(String stdin, String... arguments) throws Exception {
        var command = new ArrayList<String>();
        command.add("docker"); command.addAll(List.of(arguments));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        try {
            if (stdin != null) process.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            if (!process.waitFor(15, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("Disposable common relay Docker command timed out");
            }
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable common relay Docker command failed: " + process.exitValue());
            return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } finally { process.destroy(); }
    }

    private record Node(AnnotationConfigApplicationContext context, CountDownLatch subscribed) { }
}
