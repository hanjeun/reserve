package kr.it.reserve.reservation.scheduler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** 진단 프리뷰에서 다른 자동 작업 없이 미결제 만료만 명시적으로 허용한다. */
@Slf4j
@Profile("local")
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "reserve.preview.unpaid-expiry-enabled", havingValue = "true")
public class LocalUnpaidExpiryConfig {
    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService localUnpaidExpiryExecutor(ReservationExpiryScheduler expiry, DataSource source,
                                                      Environment environment) throws java.sql.SQLException {
        if (environment.getProperty("reserve.scheduling.enabled", Boolean.class, true)
                || !"127.0.0.1".equals(environment.getProperty("server.address"))) {
            throw new IllegalStateException("Unpaid preview expiry requires isolated loopback scheduling");
        }
        try (var connection = source.getConnection()) {
            if (!connection.getMetaData().getURL().matches("jdbc:mysql://(127\\.0\\.0\\.1|localhost)(:[0-9]+)?/reserve(\\?.*)?")) {
                throw new IllegalStateException("Unpaid preview expiry requires the loopback reserve database");
            }
        }
        var executor = Executors.newSingleThreadScheduledExecutor(task -> {
            var thread = new Thread(task, "preview-unpaid-expiry");
            thread.setDaemon(true);
            return thread;
        });
        executor.scheduleWithFixedDelay(() -> {
            try { expiry.expireUnpaidReservations(); }
            catch (RuntimeException failure) {
                log.error("Local unpaid expiry failed: errorType={}", failure.getClass().getSimpleName());
            }
        }, 30, 30, TimeUnit.SECONDS);
        return executor;
    }
}
