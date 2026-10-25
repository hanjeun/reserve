package kr.it.reserve.advertisement.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.LongAdder;

/**
 * 지표를 메모리에 모아 주기적으로 반영한다. 버킷을 원자적으로 교체해 수집 중 증가분을 보존한다.
 * 종료 전 미반영 값은 유실될 수 있으므로 결제·정산 근거로 사용하지 않는다.
 */
@Component
public class AdCounterBuffer {

    public enum CounterType { IMPRESSION, CLICK }

    private final AtomicReference<ConcurrentHashMap<Long, LongAdder>> impressions =
            new AtomicReference<>(new ConcurrentHashMap<>());
    private final AtomicReference<ConcurrentHashMap<Long, LongAdder>> clicks =
            new AtomicReference<>(new ConcurrentHashMap<>());

    private final Object impressionsLock = new Object();
    private final Object clicksLock = new Object();

    public void increment(Long adId, CounterType type) {
        AtomicReference<ConcurrentHashMap<Long, LongAdder>> ref = bucketRef(type);
        // ref.get()과 increment 사이에 swap이 끼면 이미 배출된 버킷에 늦게 더해져 유실될 수 있다.
        // 타입별 짧은 임계구역으로 그 틈을 닫는다.
        synchronized (bucketLock(type)) {
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
        synchronized (bucketLock(type)) {
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
        synchronized (bucketLock(type)) {
            ConcurrentHashMap<Long, LongAdder> current = ref.get();
            drained.forEach((adId, adder) -> {
                long delta = adder.sum();
                if (delta > 0) {
                    current.computeIfAbsent(adId, ignored -> new LongAdder()).add(delta);
                }
            });
        }
    }

    private Object bucketLock(CounterType type) {
        return switch (type) {
            case IMPRESSION -> impressionsLock;
            case CLICK -> clicksLock;
        };
    }

    private AtomicReference<ConcurrentHashMap<Long, LongAdder>> bucketRef(CounterType type) {
        return switch (type) {
            case IMPRESSION -> impressions;
            case CLICK -> clicks;
        };
    }
}
