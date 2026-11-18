package kr.it.reserve.store.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.config.updates.RedisEntityUpdateRelay;
import kr.it.reserve.store.dto.StoreRegionGroup;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

@Component
class StoreRegionCache {
    private static final long TTL_NANOS = Duration.ofMinutes(1).toNanos();
    private final LongSupplier nanoTime;
    private final AtomicLong generation = new AtomicLong();
    private Snapshot snapshot;

    StoreRegionCache() {
        this(System::nanoTime);
    }

    StoreRegionCache(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
    }

    List<StoreRegionGroup> get(Supplier<List<StoreRegionGroup>> load) {
        // 기존 트랜잭션의 아직 커밋되지 않은 데이터는 다른 요청과 공유하지 않는다.
        if (TransactionSynchronizationManager.isActualTransactionActive()) return load.get();
        return cached(load);
    }

    private synchronized List<StoreRegionGroup> cached(Supplier<List<StoreRegionGroup>> load) {
        long current = generation.get();
        if (snapshot != null && snapshot.generation() == current && nanoTime.getAsLong() - snapshot.loadedAt() < TTL_NANOS) {
            return snapshot.groups();
        }
        var groups = List.copyOf(load.get());
        snapshot = new Snapshot(current, nanoTime.getAsLong(), groups);
        return groups;
    }

    @TransactionalEventListener
    void storeChanged(StoreUpdates.RegionsChanged ignored) {
        generation.incrementAndGet();
    }

    @TransactionalEventListener
    void publicCollectionChanged(EntityUpdates.Change change) {
        if (change.entityId() == 0L && publicStoreChange(change)) generation.incrementAndGet();
    }

    @EventListener
    void remoteStoreChanged(RedisEntityUpdateRelay.RemoteChanged event) {
        if (publicStoreChange(event.change())) generation.incrementAndGet();
    }

    @EventListener
    void relayReconnected(RedisEntityUpdateRelay.Reconnected ignored) {
        generation.incrementAndGet();
    }

    private static boolean publicStoreChange(EntityUpdates.Change change) {
        return change.domain() == EntityUpdates.Domain.STORE && change.publiclyVisible();
    }

    private record Snapshot(long generation, long loadedAt, List<StoreRegionGroup> groups) { }
}
