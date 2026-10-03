package kr.it.reserve.tourism.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class TourismPhotoMetricsTest {

    private static final String SUMMARY_PREFIX = "Tourism photo metrics: scope=process startedAt=";
    private final Logger logger = (Logger) LoggerFactory.getLogger(TourismPhotoMetrics.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach
    void captureSummary() {
        previousLevel = logger.getLevel();
        logger.setLevel(Level.INFO);
        appender.setContext(logger.getLoggerContext());
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void releaseSummaryCapture() {
        logger.detachAppender(appender);
        appender.stop();
        logger.setLevel(previousLevel);
    }

    @Test
    void summaryContainsOnlyFixedFieldsAndKeepsCumulativeValues() {
        var registry = new SimpleMeterRegistry();
        try {
            var metrics = new TourismPhotoMetrics(registry);
            metrics.cacheHit();
            metrics.cacheHit();
            metrics.cacheMiss();
            metrics.imageBackoff();
            metrics.imageProxyRequest(TimeUnit.MILLISECONDS.toNanos(12), true);
            metrics.imageProxyRequest(TimeUnit.MILLISECONDS.toNanos(7), false);
            metrics.apiRequest(TourismPhotoMetrics.ApiEndpoint.AREA_LIST, TimeUnit.MILLISECONDS.toNanos(3), true);
            metrics.apiRequest(TourismPhotoMetrics.ApiEndpoint.AREA_LIST, TimeUnit.MILLISECONDS.toNanos(2), false);
            metrics.apiRequest(TourismPhotoMetrics.ApiEndpoint.DETAIL_IMAGE, TimeUnit.MILLISECONDS.toNanos(4), false);
            metrics.apiRequest(TourismPhotoMetrics.ApiEndpoint.DETAIL_IMAGE, TimeUnit.MILLISECONDS.toNanos(6), true);

            metrics.logSummary();
            String first = appender.list.getFirst().getFormattedMessage();
            long startedAt = startedAt(first);
            assertThat(first).isEqualTo(SUMMARY_PREFIX + startedAt
                    + " cacheHits=2, cacheMisses=1, imageBackoffs=1, proxyRequests=2, proxyErrors=1, proxyTimeMs=19, "
                    + "apiListRequests=2, apiListErrors=1, apiListTimeMs=5, "
                    + "apiImageRequests=2, apiImageErrors=1, apiImageTimeMs=10");

            metrics.cacheHit();
            metrics.logSummary();
            assertThat(appender.list).hasSize(2);
            assertThat(appender.list.getLast().getFormattedMessage())
                    .isEqualTo(first.replace("cacheHits=2", "cacheHits=3"));
        } finally {
            registry.close();
        }
    }

    @Test
    void freshProcessRegistryStartsFromZeroWithANewCreationBoundary() {
        var firstRegistry = new SimpleMeterRegistry();
        var nextRegistry = new SimpleMeterRegistry();
        try {
            var first = new TourismPhotoMetrics(firstRegistry);
            first.cacheHit();
            first.logSummary();
            String firstSummary = appender.list.getFirst().getFormattedMessage();
            long firstStartedAt = startedAt(firstSummary);

            long beforeCreation = System.currentTimeMillis();
            var next = new TourismPhotoMetrics(nextRegistry);
            long afterCreation = System.currentTimeMillis();
            next.logSummary();
            String nextSummary = appender.list.getLast().getFormattedMessage();
            long nextStartedAt = startedAt(nextSummary);
            assertThat(nextStartedAt).isBetween(beforeCreation, afterCreation).isGreaterThanOrEqualTo(firstStartedAt);
            assertThat(nextSummary).isEqualTo(SUMMARY_PREFIX + nextStartedAt
                    + " cacheHits=0, cacheMisses=0, imageBackoffs=0, proxyRequests=0, proxyErrors=0, proxyTimeMs=0, "
                    + "apiListRequests=0, apiListErrors=0, apiListTimeMs=0, "
                    + "apiImageRequests=0, apiImageErrors=0, apiImageTimeMs=0");

            first.logSummary();
            assertThat(appender.list).hasSize(3);
            assertThat(appender.list.getLast().getFormattedMessage()).isEqualTo(firstSummary);
        } finally {
            firstRegistry.close();
            nextRegistry.close();
        }
    }

    private static long startedAt(String summary) {
        assertThat(summary).startsWith(SUMMARY_PREFIX);
        String value = summary.substring(SUMMARY_PREFIX.length()).split(" ", 2)[0];
        return Long.parseLong(value);
    }
}
