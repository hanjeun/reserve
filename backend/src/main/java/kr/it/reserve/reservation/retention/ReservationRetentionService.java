package kr.it.reserve.reservation.retention;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.mfa.MfaPolicy;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import java.time.*;

/** 일반 가게 조회와 분리한 관리자 증거·보류 관문이에요. 원문 사본을 만들지 않아요. */
@Service
public class ReservationRetentionService {
    public enum Purpose { DISPUTE, CONTRACT, LEGAL_REQUEST }
    public record Hold(boolean active, String caseReference, String purpose) { }
    public record Evidence(ReservationResponse reservation, java.util.List<java.util.Map<String,Object>> consent,
            java.util.List<java.util.Map<String,Object>> payments, java.util.List<java.util.Map<String,Object>> refunds) { }
    private final ReservationRepository reservations;
    private final PaymentService payments;
    private final AuditLogService audit;
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    private final ReservationRetentionData data;

    public ReservationRetentionService(ReservationRepository reservations, PaymentService payments,
            AuditLogService audit, JdbcTemplate jdbc, ReservationRetentionData data,
            @Value("${reserve.reservation-retention.enabled:false}") boolean enabled) {
        this.reservations = reservations; this.payments = payments; this.audit = audit; this.jdbc = jdbc; this.enabled = enabled; this.data = data;
    }

    @jakarta.annotation.PostConstruct
    void checkSchema() {
        if (enabled) jdbc.queryForList("SELECT retention_hold_id,reservation_id,case_reference,purpose,held_by,held_at,released_by,released_at FROM reservation_retention_hold WHERE 1=0");
    }

    private void requireAccess() {
        if (!SecurityUtil.getCurrentMember().isAdmin() || !MfaPolicy.strong(SecurityUtil.getLoginMethod()))
            throw new ReservationException("추가 인증을 마친 관리자만 거래 증거를 확인할 수 있어요.", HttpStatus.FORBIDDEN);
        if (!enabled) throw new ReservationException("예약 증거 보관 기능을 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Evidence evidence(Long id, Purpose purpose) {
        requireAccess();
        if (purpose == null) throw new ReservationException("증거 조회 목적을 선택해주세요.", HttpStatus.BAD_REQUEST);
        payments.lockReservationForStateChange(id);
        Reservation reservation = reservations.findByIdForUpdate(id).orElseThrow(ReservationException::notFound);
        requireRetained(reservation);
        audit.recordReservationRetention(id, "EVIDENCE_READ", purpose.name());
        return new Evidence(ReservationResponse.fromEntity(reservation),
                jdbc.queryForList("SELECT notice_version,notice_hash,notice_snapshot,privacy_accepted,conditions_accepted,accepted_at,expires_at FROM reservation_consent WHERE reservation_id=?", id),
                jdbc.queryForList("SELECT payment_id,merchant_uid,amount,status,pay_method,refund_amount,paid_at,refunded_at,buyer_name,buyer_email FROM payment WHERE reservation_id=? ORDER BY payment_id", id),
                jdbc.queryForList("SELECT a.refund_attempt_id,a.requested_amount,a.cancelled_amount,a.status,a.created_at,a.updated_at FROM refund_attempt a JOIN payment p ON p.payment_id=a.payment_id WHERE p.reservation_id=? ORDER BY a.refund_attempt_id", id));
    }

    public java.util.Map<String,Boolean> availability() {
        return java.util.Map.of("enabled", enabled, "strongAuthentication", MfaPolicy.strong(SecurityUtil.getLoginMethod()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Hold hold(Long id, Purpose purpose, String caseReference) {
        requireAccess();
        if (purpose == null || caseReference == null || !caseReference.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,79}"))
            throw new ReservationException("개인정보 없이 사건 참조 번호와 보류 목적을 입력해주세요.", HttpStatus.BAD_REQUEST);
        payments.lockReservationForStateChange(id);
        requireRetained(reservations.findByIdForUpdate(id).orElseThrow(ReservationException::notFound));
        var existing = jdbc.queryForList("SELECT retention_hold_id FROM reservation_retention_hold WHERE reservation_id=? AND released_at IS NULL FOR UPDATE", id);
        if (!existing.isEmpty())
            throw new ReservationException("진행 중인 보류를 먼저 확인해주세요.", HttpStatus.CONFLICT);
        LocalDateTime at = LocalDateTime.now(Clock.systemUTC());
        jdbc.update("INSERT INTO reservation_retention_hold(reservation_id,case_reference,purpose,held_by,held_at) VALUES (?,?,?,?,?)",
                id, caseReference, purpose.name(), SecurityUtil.getCurrentMemberId(), at);
        audit.recordReservationRetention(id, "RETENTION_HOLD", purpose.name());
        return new Hold(true, caseReference, purpose.name());
    }

    private void requireRetained(Reservation reservation) {
        LocalDateTime expiry = data.expiresAt(reservation);
        if (kr.it.reserve.reservation.service.ReservationRemovalPolicy.finished(reservation)
                && expiry != null && !LocalDateTime.now(Clock.systemUTC()).isBefore(expiry)
                && !data.held(reservation.getId()) && payments.isReservationRemovalSafe(reservation))
            throw new ReservationException("거래 증거 보유기간이 지났어요.", HttpStatus.GONE);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void release(Long id, String caseReference) {
        requireAccess(); payments.lockReservationForStateChange(id);
        reservations.findByIdForUpdate(id).orElseThrow(ReservationException::notFound);
        var current = jdbc.queryForList("SELECT purpose FROM reservation_retention_hold WHERE reservation_id=? AND case_reference=? AND released_at IS NULL FOR UPDATE", id, caseReference);
        if (current.size() != 1) throw new ReservationException("현재 보류의 사건 참조 번호를 확인해주세요.", HttpStatus.CONFLICT);
        int changed = jdbc.update("UPDATE reservation_retention_hold SET released_by=?,released_at=? WHERE reservation_id=? AND case_reference=? AND released_at IS NULL",
                SecurityUtil.getCurrentMemberId(), LocalDateTime.now(Clock.systemUTC()), id, caseReference);
        if (changed != 1) throw new ReservationException("현재 보류의 사건 참조 번호를 확인해주세요.", HttpStatus.CONFLICT);
        audit.recordReservationRetention(id, "RETENTION_RELEASE", current.getFirst().get("purpose").toString());
    }
}
