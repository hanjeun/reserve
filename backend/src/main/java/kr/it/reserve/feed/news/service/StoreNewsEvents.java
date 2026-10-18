package kr.it.reserve.feed.news.service;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Only invalidation signals cross the stream; the existing APIs authorize every data read. */
@Component @RequiredArgsConstructor
public class StoreNewsEvents {
    private final ApplicationEventPublisher events;
    private final StoreNewsAvailability policy;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntityUpdates updates;
    private final Map<SseEmitter, Subscriber> subscribers = new ConcurrentHashMap<>();

    public void changed(Long newsId, Long ownerId, boolean publicChanged) {
        events.publishEvent(new Changed(newsId, ownerId, publicChanged));
        if (updates != null) updates.publish(EntityUpdates.Domain.NEWS, newsId, null, null,
                EntityUpdates.Operation.UPDATED, publicChanged,
                ownerId == null ? java.util.Set.of() : java.util.Set.of(ownerId), true);
    }

    public SseEmitter subscribe(Member member) {
        policy.requireEnabled();
        if (member == null || member.getId() == null || member.isDeleted() || member.isSuspended()
                || member.getRole() != Role.ADMIN && member.getRole() != Role.BUSINESS) {
            throw new FeedException("사업자 또는 관리자 로그인이 필요해요.", HttpStatus.FORBIDDEN);
        }
        return register(new Subscriber(member.getId(), member.getRole() == Role.ADMIN, null));
    }

    public SseEmitter subscribePublic(String address) {
        policy.requireEnabled();
        return register(new Subscriber(null, false, address));
    }

    private synchronized SseEmitter register(Subscriber subscriber) {
        long same = subscribers.values().stream().filter(value -> subscriber.memberId() != null
                ? subscriber.memberId().equals(value.memberId()) : subscriber.publicAddress().equals(value.publicAddress())).count();
        if (subscribers.size() >= 256 || same >= 4) throw new FeedException("연결이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        SseEmitter emitter = new SseEmitter(120_000L);
        subscribers.put(emitter, subscriber);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> { subscribers.remove(emitter); emitter.complete(); });
        emitter.onError(error -> subscribers.remove(emitter));
        send(emitter, "ready");
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(Changed event) {
        subscribers.forEach((emitter, subscriber) -> {
            boolean allowed = subscriber.memberId() == null ? event.publicChanged()
                    : subscriber.admin() || subscriber.memberId().equals(event.ownerId());
            if (allowed) send(emitter, "news-changed");
        });
    }

    @Scheduled(fixedDelay = 15_000)
    public void heartbeat() { subscribers.keySet().forEach(emitter -> send(emitter, "heartbeat")); }

    private void send(SseEmitter emitter, String name) {
        try { emitter.send(SseEmitter.event().name(name).data(Map.of())); }
        catch (java.io.IOException | IllegalStateException disconnected) { subscribers.remove(emitter); }
    }
    public record Changed(Long newsId, Long ownerId, boolean publicChanged) {}
    private record Subscriber(Long memberId, boolean admin, String publicAddress) {}
}
