package kr.it.reserve.file.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** 권한 검사를 마친 읽기에서만 암호문을 재사용한다. 평문은 보관하지 않는다. */
final class ChatImageCiphertextCache {
    private final long maxBytes;
    private final int maxEntries;
    private final long ttlNanos;
    private final LongSupplier ticker;
    private final Map<String, Entry> entries = new LinkedHashMap<>(16, 0.75f, true);
    private final Map<String, CompletableFuture<byte[]>> flights = new HashMap<>();
    private long bytes;
    private Counter hits;
    private Counter misses;
    private Counter shared;

    ChatImageCiphertextCache() { this(16L * 1024 * 1024, 128, Duration.ofMinutes(2), System::nanoTime); }

    ChatImageCiphertextCache(long maxBytes, int maxEntries, Duration ttl, LongSupplier ticker) {
        if (maxBytes <= 0 || maxEntries <= 0 || ttl.isNegative() || ttl.isZero()) throw new IllegalArgumentException("Invalid cache bounds");
        this.maxBytes = maxBytes;
        this.maxEntries = maxEntries;
        this.ttlNanos = ttl.toNanos();
        this.ticker = ticker;
    }

    void bindMetrics(MeterRegistry registry) {
        hits = registry.counter("reserve.chat.image.cache.reads", "result", "hit");
        misses = registry.counter("reserve.chat.image.cache.reads", "result", "miss");
        shared = registry.counter("reserve.chat.image.cache.reads", "result", "shared");
        Gauge.builder("reserve.chat.image.cache.bytes", this, ChatImageCiphertextCache::byteCount).register(registry);
    }

    byte[] read(String key, Supplier<byte[]> load) {
        CompletableFuture<byte[]> flight;
        boolean owner;
        synchronized (this) {
            expire();
            var entry = entries.get(key);
            if (entry != null) {
                increment(hits);
                return entry.content().clone();
            }
            flight = flights.get(key);
            owner = flight == null;
            if (owner) { flight = new CompletableFuture<>(); flights.put(key, flight); increment(misses); }
            else increment(shared);
        }
        if (owner) {
            try {
                byte[] content = load.get();
                synchronized (this) {
                    if (flights.get(key) == flight) {
                        flights.remove(key);
                        if (content.length <= maxBytes) {
                            expire();
                            while (!entries.isEmpty() && (bytes + content.length > maxBytes || entries.size() >= maxEntries)) {
                                var oldest = entries.entrySet().iterator();
                                bytes -= oldest.next().getValue().content().length;
                                oldest.remove();
                            }
                            entries.put(key, new Entry(content, ticker.getAsLong()));
                            bytes += content.length;
                        }
                    }
                }
                flight.complete(content);
            } catch (RuntimeException | Error failure) {
                synchronized (this) { flights.remove(key, flight); }
                flight.completeExceptionally(failure);
                throw failure;
            }
        }
        try { return flight.join().clone(); }
        catch (CompletionException failure) {
            if (failure.getCause() instanceof RuntimeException cause) throw cause;
            if (failure.getCause() instanceof Error cause) throw cause;
            throw failure;
        }
    }

    synchronized void invalidate(String key) {
        var previous = entries.remove(key);
        if (previous != null) bytes -= previous.content().length;
        flights.remove(key);
    }

    synchronized long byteCount() { expire(); return bytes; }

    private void expire() {
        long now = ticker.getAsLong();
        var iterator = entries.values().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            if (now - entry.createdAt() >= ttlNanos) { bytes -= entry.content().length; iterator.remove(); }
        }
    }

    private static void increment(Counter counter) { if (counter != null) counter.increment(); }
    private record Entry(byte[] content, long createdAt) {}
}
