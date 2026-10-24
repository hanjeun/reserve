package kr.it.reserve.waiting.service;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.config.updates.UpdateStreamAccess;
import kr.it.reserve.waiting.error.WaitingException;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.time.LocalDateTime;
import java.util.function.Supplier;

/** 본인에게 필요한 갱신 신호만 전송한다. 명단·이름·QR·대기번호는 SSE에 포함하지 않는다. */
@Component
public class WaitingEventStream {
    private final Map<SseEmitter, UpdateStreamAccess.Identity> subscribers = new ConcurrentHashMap<>();
    private final UpdateStreamAccess access;
    private final Supplier<SseEmitter> emitters;

    @Autowired
    public WaitingEventStream(UpdateStreamAccess access) {
        this(access, () -> new SseEmitter(120_000L));
    }

    WaitingEventStream(UpdateStreamAccess access, Supplier<SseEmitter> emitters) {
        this.access = access;
        this.emitters = emitters;
    }

    @Autowired(required = false)
    private RedisWaitingRelay relay;

    public synchronized SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt) {
        return subscribe(member, oauthAuthenticatedAt, null);
    }

    public synchronized SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod) {
        return subscribe(member, oauthAuthenticatedAt, loginMethod, null);
    }

    public synchronized SseEmitter subscribe(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId) {
        var identity = UpdateStreamAccess.waitingIdentity(member, oauthAuthenticatedAt, loginMethod, sessionId);
        if (identity == null || !access.current(identity)) {
            throw new WaitingException("로그인 상태를 확인해주세요.", HttpStatus.FORBIDDEN);
        }
        if (subscribers.size() >= 256 || subscribers.values().stream()
                .filter(other -> identity.memberId().equals(other.memberId())).count() >= 4) {
            throw new WaitingException("연결이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        SseEmitter emitter = emitters.get();
        subscribers.put(emitter, identity);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> { subscribers.remove(emitter); emitter.complete(); });
        emitter.onError(error -> subscribers.remove(emitter));
        send(emitter, "ready", Map.of());
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(WaitingEventPublisher.Changed event) {
        deliver(event.storeId(), event.memberIds());
        if (relay != null) relay.publish(event);
    }

    @EventListener
    public void remoteChanged(RedisWaitingRelay.RemoteChanged event) { deliver(event.storeId(), event.memberIds()); }

    private void deliver(Long storeId, java.util.Set<Long> memberIds) {
        subscribers.forEach((emitter, identity) -> {
            if (valid(emitter, identity) && memberIds.contains(identity.memberId())) {
                send(emitter, "waiting-changed", Map.of("storeId", storeId));
            }
        });
    }

    @Scheduled(fixedDelay = 15_000)
    public void heartbeat() {
        subscribers.forEach((emitter, identity) -> {
            if (valid(emitter, identity)) send(emitter, "heartbeat", Map.of());
        });
    }

    private boolean valid(SseEmitter emitter, UpdateStreamAccess.Identity identity) {
        boolean current;
        try { current = access.current(identity); }
        catch (RuntimeException unavailable) {
            subscribers.remove(emitter);
            complete(emitter);
            return false;
        }
        if (current) return true;
        subscribers.remove(emitter);
        if (send(emitter, "session-ended", Map.of())) complete(emitter);
        return false;
    }

    private void complete(SseEmitter emitter) {
        try { emitter.complete(); }
        catch (IllegalStateException disconnected) { /* Already closed by the Servlet container. */ }
    }

    private boolean send(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
            return true;
        } catch (java.io.IOException | IllegalStateException disconnected) {
            subscribers.remove(emitter);
            // 쓰기 실패의 최종 async dispatch는 Servlet/Spring이 처리한다. complete를 다시 호출하지 않는다.
            return false;
        }
    }
}
