package kr.it.reserve.reservation.retention;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.*;

@Component
@Slf4j
public class ReservationRetentionScheduler {
    private final JdbcTemplate jdbc;
    private final ReservationRetentionWorker worker;
    private final boolean active;
    private long afterId;
    private long throughId;

    public ReservationRetentionScheduler(JdbcTemplate jdbc, ReservationRetentionWorker worker,
            @Value("${reserve.reservation-retention.enabled:false}") boolean enabled,
            @Value("${reserve.reservation-retention.purge-enabled:false}") boolean purgeEnabled) {
        this.jdbc = jdbc; this.worker = worker; this.active = enabled && purgeEnabled;
    }

    @Scheduled(fixedDelayString="${reserve.reservation-retention.interval-ms:3600000}")
    public synchronized void sweep() {
        if (!active) return;
        if (throughId == 0) throughId = jdbc.queryForObject("SELECT COALESCE(MAX(reservation_id),0) FROM reservation", Long.class);
        var ids = jdbc.queryForList("SELECT reservation_id FROM reservation WHERE reservation_id>? AND reservation_id<=? AND reservation_date<? ORDER BY reservation_id LIMIT 50",
                Long.class, afterId, throughId, kr.it.reserve.global.common.ServiceTime.today().minusYears(ReservationPrivacyPolicy.EVIDENCE_YEARS));
        LocalDateTime now = LocalDateTime.now(Clock.systemUTC());
        int purged = 0;
        for (Long id : ids) {
            afterId = id;
            try { if (worker.purge(id, now) == ReservationRetentionWorker.Result.PURGED) purged++; }
            catch (RuntimeException error) { log.warn("Reservation retention deferred: reservationId={}, errorType={}", id, error.getClass().getSimpleName()); }
        }
        if (ids.size() < 50) { afterId = 0; throughId = 0; }
        if (purged > 0) log.info("Reservation retention completed: purged={}", purged);
    }
}
