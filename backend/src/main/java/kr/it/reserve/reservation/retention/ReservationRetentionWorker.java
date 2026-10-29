package kr.it.reserve.reservation.retention;

import jakarta.persistence.EntityManager;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationRemovalPolicy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.List;

/** 예약 한 건의 보존·금전·분쟁을 잠금 아래 확인한 뒤 같은 트랜잭션에서 파기해요. */
@Service
public class ReservationRetentionWorker {
    public enum Result { DISABLED, RETAINED, PURGED, MISSING }
    private final ReservationRepository reservations;
    private final PaymentService payments;
    private final JdbcTemplate jdbc;
    private final ReservationRetentionData data;
    private final AuditLogService audit;
    private final EntityManager entities;
    private final boolean enabled;
    private final boolean purgeEnabled;

    public ReservationRetentionWorker(ReservationRepository reservations, PaymentService payments, JdbcTemplate jdbc,
            ReservationRetentionData data, AuditLogService audit, EntityManager entities,
            @Value("${reserve.reservation-retention.enabled:false}") boolean enabled,
            @Value("${reserve.reservation-retention.purge-enabled:false}") boolean purgeEnabled) {
        this.reservations = reservations; this.payments = payments; this.jdbc = jdbc; this.data = data;
        this.audit = audit; this.entities = entities; this.enabled = enabled; this.purgeEnabled = purgeEnabled;
    }

    @jakarta.annotation.PostConstruct
    void validateConfiguration() {
        if (purgeEnabled && !enabled) throw new IllegalStateException("Reservation purge requires retention activation");
        if (enabled) jdbc.queryForList("SELECT reservation_id,expires_at FROM reservation_consent WHERE 1=0");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public Result purge(Long id, LocalDateTime nowUtc) {
        if (!enabled || !purgeEnabled) return Result.DISABLED;
        if (!reservations.existsById(id)) return Result.MISSING;
        payments.lockReservationForStateChange(id);
        Reservation reservation = reservations.findByIdForUpdate(id).orElse(null);
        if (reservation == null) return Result.MISSING;
        LocalDateTime expiry = data.expiresAt(reservation);
        if (!ReservationRemovalPolicy.finished(reservation) || data.held(id)
                || expiry == null || nowUtc.isBefore(expiry)) return Result.RETAINED;
        if (!payments.isReservationRemovalSafe(reservation)) return Result.RETAINED;

        List<String> orders = jdbc.queryForList("SELECT merchant_uid FROM payment WHERE reservation_id=?", String.class, id);
        for (String order : orders) {
            Integer pending = jdbc.queryForObject("SELECT COUNT(*) FROM payment_webhook_inbox WHERE merchant_uid=? AND status NOT IN ('PROCESSED','IGNORED')", Integer.class, order);
            if (pending == null || pending > 0) return Result.RETAINED;
        }
        entities.flush();
        // 리뷰는 별도 공개 콘텐츠이므로 예약 연결만 해제해요.
        jdbc.update("UPDATE review SET reservation_id=NULL WHERE reservation_id=?", id);
        for (Long paymentId : jdbc.queryForList("SELECT payment_id FROM payment WHERE reservation_id=?", Long.class, id)) {
            jdbc.update("DELETE FROM refund_attempt WHERE payment_id=?", paymentId);
            jdbc.update("DELETE FROM test_settlement_payout WHERE payment_id=?", paymentId);
            jdbc.update("DELETE FROM payment_reconciliation_issue WHERE payment_id=?", paymentId);
        }
        for (String order : orders) jdbc.update("DELETE FROM payment_webhook_inbox WHERE merchant_uid=? AND status IN ('PROCESSED','IGNORED')", order);
        jdbc.update("DELETE FROM payment_reconciliation_issue WHERE reservation_id=?", id);
        jdbc.update("DELETE FROM payment WHERE reservation_id=?", id);
        jdbc.update("DELETE FROM reservation_request WHERE reservation_id=?", id);
        jdbc.update("DELETE FROM reservation_consent WHERE reservation_id=?", id);
        jdbc.update("DELETE FROM reservation_retention_hold WHERE reservation_id=?", id);
        jdbc.update("DELETE FROM audit_log WHERE entity_type='RESERVATION' AND entity_id=?", id);
        if (jdbc.update("DELETE FROM reservation WHERE reservation_id=?", id) != 1)
            throw new IllegalStateException("Reservation retention deletion lost its locked row");
        entities.clear();
        audit.recordReservationRetention(id, "RETENTION_PURGE", "RETENTION_EXPIRED");
        return Result.PURGED;
    }
}
