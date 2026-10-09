package kr.it.reserve.waiting.service;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.waiting.error.WaitingException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 단일 인스턴스의 갱신 신호만 전송한다. 명단·이름·QR·대기번호는 SSE에 포함하지 않는다. */
@Component
public class WaitingEventStream {
    private final Map<SseEmitter, Long> subscribers = new ConcurrentHashMap<>();

    public synchronized SseEmitter subscribe(Member member) {
        if (member == null || member.getId() == null || member.isDeleted() || member.isSuspended()) {
            throw new WaitingException("로그인 상태를 확인해주세요.", HttpStatus.FORBIDDEN);
        }
        if (subscribers.size() >= 256 || subscribers.values().stream().filter(member.getId()::equals).count() >= 4) {
            throw new WaitingException("연결이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        SseEmitter emitter = new SseEmitter(120_000L);
        subscribers.put(emitter, member.getId());
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> { subscribers.remove(emitter); emitter.complete(); });
        emitter.onError(error -> subscribers.remove(emitter));
        send(emitter, "ready", Map.of());
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(WaitingEventPublisher.Changed event) {
        subscribers.forEach((emitter, memberId) -> {
            if (event.memberIds().contains(memberId)) send(emitter, "waiting-changed", Map.of("storeId", event.storeId()));
        });
    }

    @Scheduled(fixedDelay = 15_000)
    public void heartbeat() { subscribers.keySet().forEach(emitter -> send(emitter, "heartbeat", Map.of())); }

    private void send(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (java.io.IOException | IllegalStateException disconnected) {
            subscribers.remove(emitter);
            emitter.complete();
        }
    }
}
