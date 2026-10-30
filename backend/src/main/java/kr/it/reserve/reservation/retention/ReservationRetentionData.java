package kr.it.reserve.reservation.retention;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.reservation.entity.Reservation;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.*;

@Repository
@RequiredArgsConstructor
public class ReservationRetentionData {
    private final JdbcTemplate jdbc;

    public boolean held(Long id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*)>0 FROM reservation_retention_hold WHERE reservation_id=? AND released_at IS NULL", Boolean.class, id));
    }

    public LocalDateTime expiresAt(Reservation reservation) {
        LocalDateTime end = ReservationPrivacyPolicy.usageEnd(reservation);
        if (end == null || reservation.getCreatedAt() == null) return null;
        LocalDateTime basis = reservation.getCreatedAt();
        basis = latest(basis, end.atZone(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime());
        basis = latest(basis, time("SELECT MAX(COALESCE(refunded_at,paid_at,created_at)) FROM payment WHERE reservation_id=?", reservation.getId()));
        basis = latest(basis, time("SELECT MAX(a.updated_at) FROM refund_attempt a JOIN payment p ON p.payment_id=a.payment_id WHERE p.reservation_id=?", reservation.getId()));
        basis = latest(basis, time("SELECT MAX(COALESCE(resolved_at,last_seen_at)) FROM payment_reconciliation_issue WHERE reservation_id=? OR payment_id IN (SELECT payment_id FROM payment WHERE reservation_id=?) OR merchant_uid IN (SELECT merchant_uid FROM payment WHERE reservation_id=?)", reservation.getId(), reservation.getId(), reservation.getId()));
        basis = latest(basis, time("SELECT MAX(s.created_at) FROM test_settlement_payout s JOIN payment p ON p.payment_id=s.payment_id WHERE p.reservation_id=?", reservation.getId()));
        LocalDateTime expiry = basis.plusYears(ReservationPrivacyPolicy.EVIDENCE_YEARS);
        expiry = latest(expiry, time("SELECT MAX(expires_at) FROM reservation_consent WHERE reservation_id=?", reservation.getId()));
        // 종결한 분쟁 기록은 해제 시각부터 3년을 추가로 보호해요.
        LocalDateTime released = time("SELECT MAX(released_at) FROM reservation_retention_hold WHERE reservation_id=?", reservation.getId());
        return released == null ? expiry : latest(expiry, released.plusYears(3));
    }

    private LocalDateTime time(String sql, Long... ids) {
        var values = jdbc.query(sql, (rs, index) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toLocalDateTime(), (Object[]) ids);
        return values.isEmpty() ? null : values.getFirst();
    }
    private static LocalDateTime latest(LocalDateTime first, LocalDateTime second) {
        return second != null && (first == null || second.isAfter(first)) ? second : first;
    }
}
