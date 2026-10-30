package kr.it.reserve.file.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ChatImageCiphertextCacheTest {
    @Test void boundsBytesAndEntriesWithLruExpiryAndDefensiveCopies() {
        var clock = new AtomicLong();
        var cache = new ChatImageCiphertextCache(6, 2, Duration.ofNanos(10), clock::get);
        var registry = new SimpleMeterRegistry(); cache.bindMetrics(registry);
        byte[] first = cache.read("first", () -> new byte[] {1, 2, 3});
        cache.read("second", () -> new byte[] {4, 5, 6});
        first[0] = 99;
        assertThat(cache.read("first", () -> { throw new AssertionError(); })).containsExactly(1, 2, 3);
        cache.read("third", () -> new byte[] {7});
        var reloads = new AtomicInteger();
        cache.read("second", () -> { reloads.incrementAndGet(); return new byte[] {8}; });
        assertThat(reloads).hasValue(1);
        assertThat(cache.byteCount()).isLessThanOrEqualTo(6);
        clock.set(10);
        assertThat(cache.byteCount()).isZero();
        assertThat(registry.get("reserve.chat.image.cache.reads").tag("result", "hit").counter().count()).isEqualTo(1);
    }

    @Test void sharesConcurrentLoadsButNeverRetainsFailuresOrOversizedValues() throws Exception {
        var cache = new ChatImageCiphertextCache(4, 2, Duration.ofMinutes(1), System::nanoTime);
        var registry = new SimpleMeterRegistry(); cache.bindMetrics(registry);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var loads = new AtomicInteger();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> cache.read("image", () -> {
                loads.incrementAndGet(); entered.countDown();
                try { if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Load did not finish"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                return new byte[] {1, 2};
            }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> cache.read("image", () -> { loads.incrementAndGet(); return new byte[] {3}; }));
            try {
                org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() ->
                        registry.get("reserve.chat.image.cache.reads").tag("result", "shared").counter().count() == 1);
            } finally { release.countDown(); }
            assertThat(first.get(2, TimeUnit.SECONDS)).containsExactly(1, 2);
            assertThat(second.get(2, TimeUnit.SECONDS)).containsExactly(1, 2);
            assertThat(loads).hasValue(1);
        }
        assertThatThrownBy(() -> cache.read("failed", () -> { throw new IllegalStateException("offline"); })).hasMessage("offline");
        assertThat(cache.read("failed", () -> new byte[] {4})).containsExactly(4);
        cache.read("large", () -> new byte[5]);
        cache.read("large", () -> { loads.incrementAndGet(); return new byte[5]; });
        assertThat(loads).hasValue(2);
    }

    @Test void invalidationDuringAReadPreventsLateRepopulation() {
        var cache = new ChatImageCiphertextCache();
        cache.read("deleted", () -> { cache.invalidate("deleted"); return new byte[] {1}; });
        assertThat(cache.byteCount()).isZero();
        assertThat(cache.read("deleted", () -> new byte[] {2})).containsExactly(2);
        cache.invalidate("deleted");
        assertThat(cache.byteCount()).isZero();
    }
}
