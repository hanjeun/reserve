package kr.it.reserve.config.updates;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.SubscriptionListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/** 노드 간에는 임시 갱신 신호만 전달한다. 정본은 MySQL과 권한을 검사하는 REST 조회다. */
@Slf4j
public class RedisEntityUpdateRelay implements MessageListener, SubscriptionListener {
    static final int MAX_BYTES = 65_536;
    static final int MAX_RECIPIENTS = 512;
    static final int MAX_ORIGINS = 256;
    static final long MAX_AGE_MILLIS = 60_000;
    private static final long FUTURE_SKEW_MILLIS = 5_000;
    private final String channel;
    private final String origin = UUID.randomUUID().toString();
    private final StringRedisTemplate redis;
    private final RedisMessageListenerContainer container;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher events;
    private final RedisFailureBackoff fallback;
    private final SecretKeySpec audienceKey;
    private final Executor publisher;
    private final LongSupplier clock;
    private final Map<String, Cursor> origins = new HashMap<>();
    private long sequence;
    private long subscriptionGeneration;
    private long lastWarning;

    public RedisEntityUpdateRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
            ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback,
            RedisNamespace namespace, String password) {
        this(redis, container, mapper, events, fallback, namespace, password,
                new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(128), task -> {
                    Thread worker = new Thread(task, "entity-updates-redis");
                    worker.setDaemon(true);
                    return worker;
                }), System::currentTimeMillis);
    }

    RedisEntityUpdateRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
            ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback,
            RedisNamespace namespace, String password, Executor publisher, LongSupplier clock) {
        if (password == null || password.length() < 32 || namespace == null) {
            throw new IllegalArgumentException("Entity update relay requires the scoped Redis credentials");
        }
        this.redis = redis;
        this.container = container;
        this.mapper = mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.events = events;
        this.fallback = fallback;
        this.channel = namespace.prefix() + "entity-updates:v1";
        this.audienceKey = new SecretKeySpec(hmac(password.getBytes(StandardCharsets.UTF_8),
                namespace.prefix() + "entity-updates-audience:v1"), "HmacSHA256");
        this.publisher = publisher;
        this.clock = clock;
    }

    @PostConstruct
    void register() {
        // 유한한 릴레이 컨테이너와 재연결은 기존 Redis 생명주기에서 관리한다.
        container.addMessageListener(this, ChannelTopic.of(channel));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public synchronized void changed(EntityUpdates.Change change) {
        long next = ++sequence;
        long now = clock.getAsLong();
        if (!valid(change) || change.members().size() > MAX_RECIPIENTS) {
            warnDropped(now);
            return;
        }
        if (!fallback.available()) return;
        Set<String> audience = change.members().stream().map(this::audience).collect(Collectors.toUnmodifiableSet());
        Envelope envelope = new Envelope(1, origin, next, now, Metadata.of(change), audience);
        try { publisher.execute(() -> publish(envelope)); }
        catch (RejectedExecutionException saturated) { warnDropped(now); }
    }

    private void publish(Envelope envelope) {
        if (!fallback.available() || !fresh(envelope.emittedAt(), clock.getAsLong())) return;
        try {
            String json = mapper.writeValueAsString(envelope);
            if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
                warnDropped(clock.getAsLong());
                return;
            }
            redis.convertAndSend(channel, json);
        } catch (IOException invalid) { warnDropped(clock.getAsLong()); }
        catch (RuntimeException unavailable) { fallback.failed(unavailable); }
    }

    @Override
    public synchronized void onMessage(Message message, byte[] pattern) {
        byte[] bytes = message.getBody();
        if (bytes.length > MAX_BYTES || !channel.equals(new String(message.getChannel(), StandardCharsets.UTF_8))) return;
        try {
            Envelope envelope = mapper.readValue(bytes, Envelope.class);
            long now = clock.getAsLong();
            if (!valid(envelope, now) || origin.equals(envelope.origin())) return;
            origins.entrySet().removeIf(entry -> now - entry.getValue().receivedAt() > MAX_AGE_MILLIS);
            Cursor previous = origins.get(envelope.origin());
            if (previous != null && envelope.sequence() <= previous.sequence()) return;
            if (previous == null && origins.size() >= MAX_ORIGINS) return;
            origins.put(envelope.origin(), new Cursor(envelope.sequence(), now, subscriptionGeneration));
            if (previous != null && previous.generation() == subscriptionGeneration
                    && envelope.sequence() != previous.sequence() + 1) {
                events.publishEvent(new Reconnected());
            }
            Set<String> audience = Set.copyOf(envelope.audience());
            events.publishEvent(new RemoteChanged(envelope.change().asChange(), id -> audience.contains(audience(id))));
        } catch (IOException | IllegalArgumentException invalid) { warnDropped(clock.getAsLong()); }
    }

    @Override
    public synchronized void onChannelSubscribed(byte[] subscribed, long count) {
        if (channel.equals(new String(subscribed, StandardCharsets.UTF_8))) {
            subscriptionGeneration++;
            events.publishEvent(new Reconnected());
        }
    }

    public void close() {
        container.removeMessageListener(this);
        if (publisher instanceof ExecutorService executor) executor.shutdownNow();
    }

    private boolean valid(Envelope envelope, long now) {
        return envelope != null && envelope.version() == 1 && envelope.sequence() > 0
                && envelope.origin() != null && envelope.origin().matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                && fresh(envelope.emittedAt(), now) && envelope.change() != null && valid(envelope.change().asChange())
                && envelope.audience() != null && envelope.audience().size() <= MAX_RECIPIENTS
                && envelope.audience().stream().allMatch(token -> token != null && token.matches("[0-9a-f]{64}"));
    }

    private boolean fresh(long emittedAt, long now) {
        return emittedAt >= now - MAX_AGE_MILLIS && emittedAt <= now + FUTURE_SKEW_MILLIS;
    }

    private static boolean valid(EntityUpdates.Change change) {
        return change != null && change.domain() != null && change.operation() != null
                && change.entityId() != null && change.entityId() >= 0
                && (change.entityId() != 0 || change.operation() == EntityUpdates.Operation.INVALIDATED)
                && (change.parentId() == null || change.parentId() > 0) && (change.storeId() == null || change.storeId() > 0)
                && (!change.publiclyVisible() || EntityUpdates.publicChange(change))
                && change.members() != null && change.members().stream().allMatch(id -> id != null && id > 0);
    }

    private String audience(Long memberId) {
        return HexFormat.of().formatHex(hmac(audienceKey.getEncoded(), memberId.toString()));
    }

    private static byte[] hmac(byte[] key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException unavailable) {
            throw new IllegalStateException("Entity update audience encoding unavailable", unavailable);
        }
    }

    private synchronized void warnDropped(long now) {
        if (lastWarning == 0 || now - lastWarning >= 5_000) {
            lastWarning = now;
            log.warn("Entity update relay signal dropped; ready reconciliation and periodic refresh remain available");
        }
    }

    record Envelope(int version, String origin, long sequence, long emittedAt, Metadata change, Set<String> audience) { }
    record Metadata(EntityUpdates.Domain domain, Long entityId, Long parentId, Long storeId,
                    EntityUpdates.Operation operation, EntityUpdates.TargetType targetType,
                    boolean publiclyVisible, boolean administrators) {
        static Metadata of(EntityUpdates.Change change) {
            return new Metadata(change.domain(), change.entityId(), change.parentId(), change.storeId(),
                    change.operation(), change.targetType(), change.publiclyVisible(), change.administrators());
        }
        EntityUpdates.Change asChange() {
            return new EntityUpdates.Change(domain, entityId, parentId, storeId, operation, targetType,
                    publiclyVisible, Set.of(), administrators);
        }
    }
    private record Cursor(long sequence, long receivedAt, long generation) { }
    public record RemoteChanged(EntityUpdates.Change change, Predicate<Long> recipients) { }
    public record Reconnected() { }
}
