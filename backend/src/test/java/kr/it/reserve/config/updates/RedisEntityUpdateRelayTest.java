package kr.it.reserve.config.updates;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.redis.connection.DefaultMessage;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicLong;

import static kr.it.reserve.config.updates.EntityUpdates.Domain.*;
import static kr.it.reserve.config.updates.EntityUpdates.Operation.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RedisEntityUpdateRelayTest {
    private static final String PASSWORD = "synthetic-relay-password-not-a-production-secret";
    private static final String CHANNEL = "reserve:local:entity-updates:v1";
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);

    @Test
    void onlyCommittedChangesPublishAndWireContainsNoMemberIdsOrContent() throws Exception {
        var redis = mock(StringRedisTemplate.class);
        try (var context = new AnnotationConfigApplicationContext()) {
            var relay = relay(redis, context, RedisNamespace.LOCAL);
            context.registerBean(TransactionalEventListenerFactory.class);
            context.registerBean(RedisEntityUpdateRelay.class, () -> relay);
            context.registerBean(EntityUpdates.class, () -> new EntityUpdates(context));
            context.refresh();
            var updates = context.getBean(EntityUpdates.class);
            Runnable publish = () -> updates.publish(NOTIFICATION, 17L, 11L, null, UPDATED,
                    false, Set.of(987654321L), false);
            publish.run();
            transaction(publish, false);
            verifyNoInteractions(redis);
            transaction(() -> { publish.run(); verifyNoInteractions(redis); }, true);
            var json = ArgumentCaptor.forClass(String.class);
            verify(redis).convertAndSend(eq(CHANNEL), json.capture());
            var wire = mapper.readTree(json.getValue());
            assertThat(wire.path("audience").get(0).asText()).matches("[0-9a-f]{64}");
            assertThat(json.getValue()).doesNotContain("987654321", "memberId", "members", "content", "email", "token", PASSWORD);
            assertThat(wire.path("change").properties().stream().map(java.util.Map.Entry::getKey))
                    .containsExactlyInAnyOrder("domain", "entityId", "parentId", "storeId", "operation", "targetType", "publiclyVisible", "administrators");
            context.publishEvent(new RedisEntityUpdateRelay.RemoteChanged(change(NOTIFICATION, false, Set.of(), false), id -> true));
            verifyNoMoreInteractions(redis);
        }
    }

    @Test
    void remoteAudienceUsesTheSameCurrentAccountFilterAndLocalEpochWithoutLeakingHashes() throws Exception {
        var access = mock(UpdateStreamAccess.class);
        when(access.current(any())).thenReturn(true);
        var emitted = new ArrayList<SseEmitter>();
        var stream = new EntityUpdateStream(access, () -> {
            var emitter = mock(SseEmitter.class); emitted.add(emitter); return emitter;
        });
        stream.subscribePublic("127.0.0.1");
        stream.subscribe(EntityUpdateStreamTest.member(1, Role.USER));
        stream.subscribe(EntityUpdateStreamTest.member(2, Role.USER));
        stream.subscribe(EntityUpdateStreamTest.member(3, Role.ADMIN));
        emitted.forEach(org.mockito.Mockito::clearInvocations);
        var received = new ArrayList<Object>();
        var receiver = relay(mock(StringRedisTemplate.class), event -> {
            received.add(event);
            if (event instanceof RedisEntityUpdateRelay.RemoteChanged update) stream.remoteChanged(update);
        }, RedisNamespace.LOCAL);
        var sender = mock(StringRedisTemplate.class);
        var publisher = relay(sender, ignored -> { }, RedisNamespace.LOCAL);
        publisher.changed(change(NOTIFICATION, false, Set.of(1L), false));
        receiver.onMessage(message(lastWire(sender)), null);
        verify(emitted.get(1)).send(any(SseEmitter.SseEventBuilder.class));
        for (int index : new int[]{0, 2, 3}) verifyNoInteractions(emitted.get(index));
        var sent = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitted.get(1)).send(sent.capture());
        var signal = sent.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData)
                .filter(EntityUpdateStream.Signal.class::isInstance).map(EntityUpdateStream.Signal.class::cast).findFirst().orElseThrow();
        assertThat(signal.revision()).isEqualTo(1);
        assertThat(mapper.writeValueAsString(signal)).doesNotContain("audience", "recipient", "member", "publiclyVisible", "administrators");
        assertThat(((RedisEntityUpdateRelay.RemoteChanged) received.getFirst()).change().members()).isEmpty();
        emitted.forEach(org.mockito.Mockito::clearInvocations);
        publisher.changed(change(RESERVATION, false, Set.of(1L), true));
        receiver.onMessage(message(lastWire(sender)), null);
        verify(emitted.get(1)).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitted.get(3)).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(emitted.get(0), emitted.get(2));
        emitted.forEach(org.mockito.Mockito::clearInvocations);
        when(access.current(any())).thenAnswer(call -> ((UpdateStreamAccess.Identity) call.getArgument(0)).memberId() != 1L);
        publisher.changed(change(NOTIFICATION, false, Set.of(1L), false));
        receiver.onMessage(message(lastWire(sender)), null);
        verify(emitted.get(1)).complete();
        var ended = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitted.get(1)).send(ended.capture());
        assertThat(ended.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString()).contains("session-ended");
        verifyNoInteractions(emitted.get(0), emitted.get(2), emitted.get(3));
    }

    @Test
    void ownEchoDuplicateOutOfOrderExpiredAndWrongChannelMessagesCannotDeliver() throws Exception {
        var redis = mock(StringRedisTemplate.class);
        var events = mock(ApplicationEventPublisher.class);
        var receiver = relay(redis, events, RedisNamespace.LOCAL);
        receiver.changed(change(FEED, true, Set.of(), false));
        receiver.onMessage(message(lastWire(redis)), null);
        verifyNoInteractions(events);
        String origin = UUID.randomUUID().toString();
        String first = wire(origin, 1, now.get(), FEED, true);
        receiver.onMessage(new DefaultMessage("other-channel".getBytes(StandardCharsets.UTF_8), first.getBytes(StandardCharsets.UTF_8)), null);
        receiver.onMessage(message(first), null);
        receiver.onMessage(message(first), null);
        receiver.onMessage(message(wire(origin, 3, now.get(), FEED, true)), null);
        receiver.onMessage(message(wire(origin, 2, now.get(), FEED, true)), null);
        receiver.onMessage(message(wire(origin, 4, now.get() - RedisEntityUpdateRelay.MAX_AGE_MILLIS - 1, FEED, true)), null);
        receiver.onMessage(message(wire(origin, 4, now.get() + 5_001, FEED, true)), null);
        verify(events, times(2)).publishEvent(any(RedisEntityUpdateRelay.RemoteChanged.class));
        verify(events).publishEvent(any(RedisEntityUpdateRelay.Reconnected.class));
        verifyNoMoreInteractions(events);
        clearInvocations(events);
        receiver.onChannelSubscribed(CHANNEL.getBytes(StandardCharsets.UTF_8), 1);
        verify(events).publishEvent(any(RedisEntityUpdateRelay.Reconnected.class));
        clearInvocations(events);
        receiver.onMessage(message(wire(origin, 7, now.get(), FEED, true)), null);
        receiver.onMessage(message(wire(origin, 3, now.get(), FEED, true)), null);
        verify(events).publishEvent(any(RedisEntityUpdateRelay.RemoteChanged.class));
        verifyNoMoreInteractions(events);
    }

    @Test
    void malformedOrPublicPersonalMessagesAreRejectedAndOriginTrackingIsBounded() throws Exception {
        var events = mock(ApplicationEventPublisher.class);
        var receiver = relay(mock(StringRedisTemplate.class), events, RedisNamespace.LOCAL);
        receiver.onMessage(message("{"), null);
        receiver.onMessage(message(" ".repeat(RedisEntityUpdateRelay.MAX_BYTES + 1)), null);
        receiver.onMessage(message(wire(UUID.randomUUID().toString(), 1, now.get(), NOTIFICATION, true)), null);
        ObjectNode unknown = (ObjectNode) mapper.readTree(wire(UUID.randomUUID().toString(), 1, now.get(), FEED, true));
        unknown.put("content", "must never become a transport field");
        receiver.onMessage(message(mapper.writeValueAsString(unknown)), null);
        verifyNoInteractions(events);
        for (int index = 0; index < RedisEntityUpdateRelay.MAX_ORIGINS + 1; index++) {
            receiver.onMessage(message(wire(UUID.randomUUID().toString(), 1, now.get(), FEED, true)), null);
        }
        verify(events, times(RedisEntityUpdateRelay.MAX_ORIGINS)).publishEvent(any(RedisEntityUpdateRelay.RemoteChanged.class));
        now.addAndGet(RedisEntityUpdateRelay.MAX_AGE_MILLIS + 1);
        receiver.onMessage(message(wire(UUID.randomUUID().toString(), 1, now.get(), FEED, true)), null);
        verify(events, times(RedisEntityUpdateRelay.MAX_ORIGINS + 1)).publishEvent(any(RedisEntityUpdateRelay.RemoteChanged.class));
    }

    @Test
    void audienceTokensAreScopedToRedisNamespaceAndCredential() throws Exception {
        var sender = mock(StringRedisTemplate.class);
        relay(sender, ignored -> { }, RedisNamespace.LOCAL).changed(change(NOTIFICATION, false, Set.of(7L), false));
        var messages = new ArrayList<RedisEntityUpdateRelay.RemoteChanged>();
        ApplicationEventPublisher events = event -> { if (event instanceof RedisEntityUpdateRelay.RemoteChanged update) messages.add(update); };
        relay(mock(StringRedisTemplate.class), events, RedisNamespace.LOCAL).onMessage(message(lastWire(sender)), null);
        assertThat(messages.removeFirst().recipients().test(7L)).isTrue();
        var production = relay(mock(StringRedisTemplate.class), events, RedisNamespace.PRODUCTION);
        production.onMessage(new DefaultMessage("reserve:prod:entity-updates:v1".getBytes(StandardCharsets.UTF_8),
                lastWire(sender).getBytes(StandardCharsets.UTF_8)), null);
        assertThat(messages.removeFirst().recipients().test(7L)).isFalse();
        var differentPassword = new RedisEntityUpdateRelay(mock(StringRedisTemplate.class), mock(RedisMessageListenerContainer.class),
                mapper, events, new RedisFailureBackoff(), RedisNamespace.LOCAL, PASSWORD + "different", Runnable::run, now::get);
        differentPassword.onMessage(message(lastWire(sender)), null);
        assertThat(messages.removeFirst().recipients().test(7L)).isFalse();
    }

    @Test
    void reconnectClosesExistingStreamsWithoutExpiringTheAccountAndDoesNotPublishAnUpdate() throws Exception {
        var emitter = mock(SseEmitter.class);
        var stream = new EntityUpdateStream(mock(UpdateStreamAccess.class), () -> emitter);
        stream.subscribePublic("127.0.0.1");
        clearInvocations(emitter);
        var redis = mock(StringRedisTemplate.class);
        var receiver = relay(redis, event -> {
            if (event instanceof RedisEntityUpdateRelay.Reconnected connected) stream.relayReconnected(connected);
        }, RedisNamespace.LOCAL);
        receiver.onChannelSubscribed("unrelated".getBytes(StandardCharsets.UTF_8), 1);
        verifyNoInteractions(emitter);
        receiver.onChannelSubscribed(CHANNEL.getBytes(StandardCharsets.UTF_8), 1);
        verify(emitter).complete();
        verify(emitter, never()).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(redis);
    }

    @Test
    void networkFailureQueueOverflowOrExpiredQueuedWorkNeverFailsTheCommittedMutation() {
        var redis = mock(StringRedisTemplate.class);
        when(redis.convertAndSend(anyString(), anyString())).thenThrow(new IllegalStateException("synthetic offline"));
        var fallback = new RedisFailureBackoff();
        var relay = new RedisEntityUpdateRelay(redis, mock(RedisMessageListenerContainer.class), mapper, ignored -> { },
                fallback, RedisNamespace.LOCAL, PASSWORD, Runnable::run, now::get);
        assertThatCode(() -> relay.changed(change(FEED, true, Set.of(), false))).doesNotThrowAnyException();
        relay.changed(change(FEED, true, Set.of(), false));
        verify(redis).convertAndSend(anyString(), anyString());
        assertThat(fallback.available()).isFalse();
        var queued = new ArrayList<Runnable>();
        var boundedRedis = mock(StringRedisTemplate.class);
        var bounded = new RedisEntityUpdateRelay(boundedRedis, mock(RedisMessageListenerContainer.class), mapper, ignored -> { },
                new RedisFailureBackoff(), RedisNamespace.LOCAL, PASSWORD, queued::add, now::get);
        bounded.changed(change(FEED, true, Set.of(), false));
        now.addAndGet(RedisEntityUpdateRelay.MAX_AGE_MILLIS + 1);
        queued.getFirst().run();
        verifyNoInteractions(boundedRedis);
        var full = new RedisEntityUpdateRelay(boundedRedis, mock(RedisMessageListenerContainer.class), mapper, ignored -> { },
                new RedisFailureBackoff(), RedisNamespace.LOCAL, PASSWORD, work -> { throw new RejectedExecutionException("full"); }, now::get);
        assertThatCode(() -> full.changed(change(FEED, true, Set.of(), false))).doesNotThrowAnyException();
        verifyNoInteractions(boundedRedis);
    }

    @Test
    void oversizedAudienceAndInvalidPrivatePublishAreDroppedWithoutBroadeningThem() {
        var redis = mock(StringRedisTemplate.class);
        var relay = relay(redis, ignored -> { }, RedisNamespace.LOCAL);
        Set<Long> oversized = java.util.stream.LongStream.rangeClosed(1, RedisEntityUpdateRelay.MAX_RECIPIENTS + 1)
                .boxed().collect(java.util.stream.Collectors.toSet());
        relay.changed(change(NOTIFICATION, false, oversized, false));
        relay.changed(change(NOTIFICATION, true, Set.of(7L), false));
        verifyNoInteractions(redis);
    }

    private RedisEntityUpdateRelay relay(StringRedisTemplate redis, ApplicationEventPublisher events, RedisNamespace namespace) {
        return new RedisEntityUpdateRelay(redis, mock(RedisMessageListenerContainer.class), mapper, events,
                new RedisFailureBackoff(), namespace, PASSWORD, Runnable::run, now::get);
    }

    private String wire(String origin, long sequence, long emittedAt, EntityUpdates.Domain domain, boolean visible) throws Exception {
        return mapper.writeValueAsString(new RedisEntityUpdateRelay.Envelope(1, origin, sequence, emittedAt,
                RedisEntityUpdateRelay.Metadata.of(change(domain, visible, Set.of(), false)), Set.of()));
    }

    private String lastWire(StringRedisTemplate redis) {
        var json = ArgumentCaptor.forClass(String.class);
        verify(redis, atLeastOnce()).convertAndSend(eq(CHANNEL), json.capture());
        return json.getValue();
    }

    private DefaultMessage message(String json) {
        return new DefaultMessage(CHANNEL.getBytes(StandardCharsets.UTF_8), json.getBytes(StandardCharsets.UTF_8));
    }

    private EntityUpdates.Change change(EntityUpdates.Domain domain, boolean visible, Set<Long> members, boolean admins) {
        return new EntityUpdates.Change(domain, 17L, 11L, 7L, UPDATED, null, visible, members, admins);
    }

    private void transaction(Runnable work, boolean commit) {
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
}
