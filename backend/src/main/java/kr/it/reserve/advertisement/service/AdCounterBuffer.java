package kr.it.reserve.advertisement.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.LongAdder;

/**
 * 광고 노출/클릭 카운터의 인메모리 버퍼.
 *
 * 예전엔 배너/배지가 렌더될 때마다 recordImpression() 한 번에 SELECT + UPDATE가 즉시 나갔다 —
 * 트래픽이 늘면 이 장식적인 지표 하나 때문에 DB 쓰기가 병목이 될 수 있어서, RateLimiter.java와
 * 같은 패턴(ConcurrentHashMap 기반, 인스턴스별 독립)으로 일단 메모리에 쌓아두고
 * AdCounterFlushScheduler가 주기적으로 걷어가 DB에 한 번에 반영하도록 바꿨다.
 *
 * 버킷을 AtomicReference로 감싸서 swapAndGet()이 "새 버킷으로 원자적 교체"가 되게 했다 —
 * 그냥 copy-then-clear 방식이면 복사와 clear() 사이에 들어온 increment가 유실될 수 있는데,
 * getAndSet()은 그 틈이 없다.
 *
 * Blue/Green 전환 순간 아직 flush 안 된 값은 유실될 수 있다 — RateLimiter의 카운터가 전환 시
 * 리셋되는 것과 같은 성격의 트레이드오프이고, 결제/정산과 무관한 장식적 지표라 감수 가능하다.
 */
@Component
public class AdCounterBuffer {

    public enum CounterType { IMPRESSION, CLICK }

    private final AtomicReference<ConcurrentHashMap<Long, LongAdder>> impressions =
            new AtomicReference<>(new ConcurrentHashMap<>());
    private final AtomicReference<ConcurrentHashMap<Long, LongAdder>> clicks =
            new AtomicReference<>(new ConcurrentHashMap<>());

    public void increment(Long adId, CounterType type) {
        AtomicReference<ConcurrentHashMap<Long, LongAdder>> ref = bucketRef(type);
        // ref.get()과 increment 사이에 swap이 끼면 이미 배출된 버킷에 늦게 더해져 유실될 수 있다.
        // 타입별 짧은 임계구역으로 그 틈을 닫는다.
        synchronized (ref) {
            ref.get().computeIfAbsent(adId, k -> new LongAdder()).increment();
        }
    }

    /**
     * 현재 버킷을 새 빈 버킷으로 원자적으로 교체하고, 교체 전 버킷을 반환한다.
     * AdCounterFlushScheduler 전용 — flush 도중 들어오는 새 increment는 유실되지 않고
     * 다음 버킷(새로 교체된 쪽)에 쌓여 다음 flush 대상이 된다.
     */
    public Map<Long, LongAdder> swapAndGet(CounterType type) {
        AtomicReference<ConcurrentHashMap<Long, LongAdder>> ref = bucketRef(type);
        synchronized (ref) {
            return ref.getAndSet(new ConcurrentHashMap<>());
        }
    }

    /**
     * DB flush가 롤백된 경우 교체했던 델타를 현재 버킷에 합친다.
     * flush 중 새로 들어온 증가분과 더하므로 다음 시도에서 어느 쪽도 유실되지 않는다.
     */
    void restore(CounterType type, Map<Long, LongAdder> drained) {
        if (drained == null || drained.isEmpty()) {
            return;
        }
        AtomicReference<ConcurrentHashMap<Long, LongAdder>> ref = bucketRef(type);
        synchronized (ref) {
            ConcurrentHashMap<Long, LongAdder> current = ref.get();
            drained.forEach((adId, adder) -> {
                long delta = adder.sum();
                if (delta > 0) {
                    current.computeIfAbsent(adId, ignored -> new LongAdder()).add(delta);
                }
            });
        }
    }

    private AtomicReference<ConcurrentHashMap<Long, LongAdder>> bucketRef(CounterType type) {
        return switch (type) {
            case IMPRESSION -> impressions;
            case CLICK -> clicks;
        };
    }
}
