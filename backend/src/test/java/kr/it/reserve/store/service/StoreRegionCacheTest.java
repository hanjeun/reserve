package kr.it.reserve.store.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.store.dto.StoreRegionGroup;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

class StoreRegionCacheTest {
    @Test
    void requestsShareOneAddressScanUntilTheMinuteExpires() {
        var clock = new AtomicLong();
        var reads = new AtomicInteger();
        var cache = new StoreRegionCache(clock::get);
        Supplier<List<StoreRegionGroup>> load = () -> List.of(new StoreRegionGroup("서울", reads.incrementAndGet(), List.of()));

        assertThat(cache.get(load)).isEqualTo(cache.get(load));
        clock.set(Duration.ofSeconds(59).toNanos());
        cache.get(load);
        assertThat(reads.get()).isEqualTo(1);

        clock.set(Duration.ofMinutes(1).toNanos());
        assertThat(cache.get(load).getFirst().count()).isEqualTo(2);
    }

    @Test
    void storeEditsInvalidateOnlyAfterCommitAndNeverShareUncommittedReads() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(TransactionalEventListenerFactory.class);
            context.registerBean(StoreRegionCache.class, () -> new StoreRegionCache());
            context.registerBean(EntityUpdates.class, () -> new EntityUpdates(context));
            context.registerBean(StoreUpdates.class);
            context.refresh();
            var cache = context.getBean(StoreRegionCache.class);
            var updates = context.getBean(StoreUpdates.class);
            var store = Store.builder().id(1L).build();
            var visible = List.of(new StoreRegionGroup("서울", 1, List.of()));
            assertThat(cache.get(() -> visible)).isEqualTo(visible);

            transaction(() -> {
                updates.updated(store, true);
                assertThat(cache.get(List::of)).isEmpty();
            }, TransactionSynchronization.STATUS_ROLLED_BACK);
            assertThat(cache.get(List::of)).isEqualTo(visible);

            transaction(() -> updates.updated(store, true), TransactionSynchronization.STATUS_COMMITTED);
            assertThat(cache.get(List::of)).isEmpty();
        }
    }

    @Test
    void aRefreshInProgressCannotKeepAnInvalidatedSnapshot() {
        var cache = new StoreRegionCache();
        var previous = List.of(new StoreRegionGroup("서울", 1, List.of()));
        assertThat(cache.get(() -> {
            cache.storeChanged(new StoreUpdates.RegionsChanged());
            return previous;
        })).isEqualTo(previous);
        assertThat(cache.get(List::of)).isEmpty();
    }

    private void transaction(Runnable work, int completion) {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            work.run();
            for (var listener : TransactionSynchronizationManager.getSynchronizations()) {
                listener.afterCompletion(completion);
            }
        } finally {
            TransactionSynchronizationManager.clear();
        }
    }
}
