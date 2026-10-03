package kr.it.reserve.tourism.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 고정된 결과·API 이름만 집계한다. 사용자 입력이나 외부 URL은 지표에 기록하지 않는다. */
@Slf4j
@Component
public class TourismPhotoMetrics {

    public enum ApiEndpoint {
        AREA_LIST("areaBasedList2"), DETAIL_IMAGE("detailImage2");

        private final String label;

        ApiEndpoint(String label) {
            this.label = label;
        }
    }

    private final long startedAt = System.currentTimeMillis();
    private final Counter cacheHits;
    private final Counter cacheMisses;
    private final Counter imageBackoffs;
    private final Timer imageProxyRequests;
    private final Counter imageProxyErrors;
    private final Map<ApiEndpoint, ApiMeters> apiMeters = new EnumMap<>(ApiEndpoint.class);

    public TourismPhotoMetrics(MeterRegistry registry) {
        cacheHits = registry.counter("reserve.tourism.image.cache", "outcome", "hit");
        cacheMisses = registry.counter("reserve.tourism.image.cache", "outcome", "miss");
        imageBackoffs = registry.counter("reserve.tourism.image.cache", "outcome", "backoff");
        imageProxyRequests = registry.timer("reserve.tourism.image.proxy");
        imageProxyErrors = registry.counter("reserve.tourism.image.proxy.errors");
        for (ApiEndpoint endpoint : ApiEndpoint.values()) {
            apiMeters.put(endpoint, new ApiMeters(
                    registry.timer("reserve.tourism.api", "endpoint", endpoint.label),
                    registry.counter("reserve.tourism.api.errors", "endpoint", endpoint.label)));
        }
    }

    void cacheHit() {
        cacheHits.increment();
    }

    void cacheMiss() {
        cacheMisses.increment();
    }

    void imageBackoff() {
        imageBackoffs.increment();
    }

    void imageProxyRequest(long elapsedNanos, boolean successful) {
        imageProxyRequests.record(elapsedNanos, TimeUnit.NANOSECONDS);
        if (!successful) imageProxyErrors.increment();
    }

    void apiRequest(ApiEndpoint endpoint, long elapsedNanos, boolean successful) {
        ApiMeters meters = apiMeters.get(endpoint);
        meters.requests().record(elapsedNanos, TimeUnit.NANOSECONDS);
        if (!successful) meters.errors().increment();
    }

    /** 앱 재시작 시 0부터 시작하는 누적값이다. Loki에서 연속된 같은 프로세스의 차이로 계산한다. */
    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void logSummary() {
        ApiMeters list = apiMeters.get(ApiEndpoint.AREA_LIST);
        ApiMeters images = apiMeters.get(ApiEndpoint.DETAIL_IMAGE);
        log.info("Tourism photo metrics: scope=process startedAt={} cacheHits={}, cacheMisses={}, imageBackoffs={}, "
                        + "proxyRequests={}, proxyErrors={}, proxyTimeMs={}, "
                        + "apiListRequests={}, apiListErrors={}, apiListTimeMs={}, "
                        + "apiImageRequests={}, apiImageErrors={}, apiImageTimeMs={}",
                startedAt, (long) cacheHits.count(), (long) cacheMisses.count(), (long) imageBackoffs.count(),
                imageProxyRequests.count(), (long) imageProxyErrors.count(),
                Math.round(imageProxyRequests.totalTime(TimeUnit.MILLISECONDS)),
                list.requests().count(), (long) list.errors().count(),
                Math.round(list.requests().totalTime(TimeUnit.MILLISECONDS)),
                images.requests().count(), (long) images.errors().count(),
                Math.round(images.requests().totalTime(TimeUnit.MILLISECONDS)));
    }

    private record ApiMeters(Timer requests, Counter errors) {}
}
