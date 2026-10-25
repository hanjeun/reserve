package kr.it.reserve.search;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/** 검색어·회원·결과 ID 없이 고정된 그룹과 결과 상태만 집계한다. */
@Component
public class SearchMetrics {
    private final MeterRegistry registry;
    private final Map<String, Timer> durations;
    private static final Set<String> GROUPS = Set.of("stores", "benefits", "feed", "reservations", "waiting", "messages");
    public SearchMetrics(MeterRegistry registry) {
        this.registry = registry;
        durations = GROUPS.stream().collect(Collectors.toUnmodifiableMap(group -> group, group ->
                Timer.builder("reserve.search.duration").tag("group", group).publishPercentiles(0.95).register(registry)));
    }
    void completed(String group, long started, int rows, boolean success) {
        Timer timer = durations.get(group);
        if (timer == null) return;
        timer.record(Math.max(0, System.nanoTime() - started), TimeUnit.NANOSECONDS);
        registry.counter("reserve.search.queries", "group", group, "outcome", success ? rows == 0 ? "empty" : "matched" : "error").increment();
    }
    void response(String audience, java.util.List<SearchResponse.Group> groups) {
        if (!Set.of("public", "personal").contains(audience) || groups.isEmpty()) return;
        long failures = groups.stream().filter(group -> group.error() != null).count();
        registry.counter("reserve.search.responses", "audience", audience, "outcome",
                failures == 0 ? "complete" : failures == groups.size() ? "error" : "partial").increment();
    }

}
