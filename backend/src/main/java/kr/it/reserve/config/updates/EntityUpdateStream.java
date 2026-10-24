package kr.it.reserve.config.updates;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.annotation.PreDestroy;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import java.util.function.Supplier;

/** A bounded, ephemeral stream: every ready event requires REST reconciliation, never event replay. */
@Component
public class EntityUpdateStream {
    static final int MAX_SUBSCRIBERS = 256;
    static final int MAX_PER_SCOPE = 4;
    private final UpdateStreamAccess access;
    private final Supplier<SseEmitter> emitters;
    private final Executor delivery;
    private final Map<SseEmitter, Subscriber> subscribers = new ConcurrentHashMap<>();
    private final String epoch = UUID.randomUUID().toString();
    private long revision;

    @Autowired
    public EntityUpdateStream(UpdateStreamAccess access) {
        this(access, () -> new SseEmitter(120_000L), new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(128), task -> {
                    Thread worker = new Thread(task, "entity-updates");
                    worker.setDaemon(true);
                    return worker;
                }));
    }

    EntityUpdateStream(UpdateStreamAccess access, Supplier<SseEmitter> emitters) {
        this(access, emitters, Runnable::run);
    }

    EntityUpdateStream(UpdateStreamAccess access, Supplier<SseEmitter> emitters, Executor delivery) {
        this.access = access;
        this.emitters = emitters;
        this.delivery = delivery;
    }

    public SseEmitter subscribe(Member member) {
        return subscribe(member, null);
    }

    public SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt) {
        return subscribe(member, oauthAuthenticatedAt, null);
    }

    public SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod) {
        return subscribe(member, oauthAuthenticatedAt, loginMethod, null);
    }

    public SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId) {
        var identity = UpdateStreamAccess.identity(member, oauthAuthenticatedAt, loginMethod, sessionId);
        if (identity == null || !access.current(identity)) {
            throw new MemberException("로그인 상태와 약관 동의를 확인해주세요.", HttpStatus.FORBIDDEN);
        }
        return register(new Subscriber(identity, null));
    }

    public SseEmitter subscribePublic(String address) {
        return register(new Subscriber(null, address == null ? "unknown" : address));
    }

    private synchronized SseEmitter register(Subscriber subscriber) {
        long same = subscribers.values().stream().filter(subscriber::sameScope).count();
        if (subscribers.size() >= MAX_SUBSCRIBERS || same >= MAX_PER_SCOPE) {
            throw new MemberException("연결이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        SseEmitter emitter = emitters.get();
        subscribers.put(emitter, subscriber);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> { subscribers.remove(emitter); emitter.complete(); });
        emitter.onError(error -> subscribers.remove(emitter));
        send(emitter, "ready", Map.of("epoch", epoch, "revision", revision, "domains", EntityUpdates.Domain.values(),
                "serverTime", Instant.now().toString()), null);
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public synchronized void changed(EntityUpdates.Change change) {
        accept(change, change.members()::contains);
    }

    @EventListener
    public synchronized void remoteChanged(RedisEntityUpdateRelay.RemoteChanged remote) {
        accept(remote.change(), remote.recipients());
    }

    @EventListener
    public synchronized void relayReconnected(RedisEntityUpdateRelay.Reconnected ignored) {
        // Pub/Sub cannot replay a disconnected interval; the next ready performs authorized REST reconciliation.
        disconnectAll();
    }

    private void accept(EntityUpdates.Change change, Predicate<Long> recipients) {
        long next = ++revision;
        var signal = new Signal(epoch + ":" + next, epoch, next, change.domain(), change.entityId(),
                change.parentId(), change.storeId(), change.operation(), change.targetType());
        enqueue(() -> deliver(change, signal, recipients));
    }

    private void deliver(EntityUpdates.Change change, Signal signal, Predicate<Long> recipients) {
        subscribers.forEach((emitter, subscriber) -> {
            if (!valid(emitter, subscriber)) return;
            var identity = subscriber.identity();
            boolean allowed = EntityUpdates.publicChange(change) || identity != null
                    && (recipients.test(identity.memberId())
                    || change.administrators() && identity.role() == Role.ADMIN);
            if (allowed) send(emitter, "update", signal, signal.eventId());
        });
    }

    @Scheduled(fixedDelay = 15_000)
    public synchronized void heartbeat() {
        enqueue(() -> subscribers.forEach((emitter, subscriber) -> {
            if (valid(emitter, subscriber)) send(emitter, "heartbeat", Map.of(), null);
        }));
    }

    private void enqueue(Runnable work) {
        try { delivery.execute(work); }
        catch (RejectedExecutionException saturated) { disconnectAll(); }
    }

    private void disconnectAll() {
        subscribers.forEach((emitter, ignored) -> complete(emitter));
        subscribers.clear();
    }

    @PreDestroy
    public void close() {
        disconnectAll();
        if (delivery instanceof ExecutorService executor) executor.shutdownNow();
    }

    private boolean valid(SseEmitter emitter, Subscriber subscriber) {
        if (subscriber.identity() == null) return true;
        boolean current;
        try { current = access.current(subscriber.identity()); }
        catch (RuntimeException unavailable) {
            subscribers.remove(emitter);
            complete(emitter);
            return false;
        }
        if (current) return true;
        subscribers.remove(emitter);
        send(emitter, "session-ended", Map.of(), null);
        complete(emitter);
        return false;
    }

    private void complete(SseEmitter emitter) {
        try { emitter.complete(); }
        catch (IllegalStateException disconnected) { /* Already closed by the Servlet container. */ }
    }

    private void send(SseEmitter emitter, String name, Object data, String id) {
        try {
            var event = SseEmitter.event().name(name).data(data).reconnectTime(5_000);
            if (id != null) event.id(id);
            emitter.send(event);
        } catch (IOException | IllegalStateException disconnected) {
            subscribers.remove(emitter);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Signal(String eventId, String epoch, long revision, EntityUpdates.Domain domain, Long entityId,
                         Long parentId, Long storeId, EntityUpdates.Operation operation, EntityUpdates.TargetType targetType) { }

    private record Subscriber(UpdateStreamAccess.Identity identity, String address) {
        boolean sameScope(Subscriber other) {
            return identity == null ? other.identity == null && address.equals(other.address)
                    : other.identity != null && identity.memberId().equals(other.identity.memberId());
        }
    }
}
