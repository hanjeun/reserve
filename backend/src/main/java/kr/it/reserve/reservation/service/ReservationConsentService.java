package kr.it.reserve.reservation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.time.*;
import java.util.*;

@Service
public class ReservationConsentService {
    public static final String VERSION = "2026-10-27";
    public record Proof(boolean privacyAccepted, boolean conditionsAccepted, @jakarta.validation.constraints.Size(max = 32) String version,
            @jakarta.validation.constraints.Pattern(regexp = "[0-9a-f]{64}") String noticeHash) { }
    public record Notice(boolean enabled, String version, String hash, Map<String, Object> details) { }
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final StoreRepository stores;
    private final boolean enabled;
    private final String recipientRetention;
    @Value("${reserve.reservation-retention.enabled:false}")
    private boolean retentionEnabled;

    public ReservationConsentService(JdbcTemplate jdbc, ObjectMapper json, StoreRepository stores,
            @Value("${reserve.reservation-consent.enabled:false}") boolean enabled,
            @Value("${reserve.reservation-consent.recipient-retention:}") String recipientRetention) {
        this.jdbc = jdbc; this.json = json; this.stores = stores; this.enabled = enabled; this.recipientRetention = recipientRetention;
    }
    @Transactional(readOnly = true)
    public Notice notice(Long storeId) {
        if (!enabled) return new Notice(false, VERSION, null, Map.of());
        Store store = stores.findById(storeId).filter(value -> !value.isDeleted() && !value.isSuspended())
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        return notice(store);
    }
    private Notice notice(Store store) {
        if (recipientRetention == null || recipientRetention.isBlank() || store.getOwner() == null)
            throw new ReservationException("예약 정보 제공 안내를 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
        Map<String, Object> details = new TreeMap<>();
        details.put("recipient", store.getName() + " 운영자");
        details.put("purpose", "예약 접수·확인 및 방문 서비스 제공");
        details.put("items", List.of("예약자 이름", "예약자 이메일", "예약 일시·인원", "요청사항", "예약·결제 상태"));
        details.put("retention", recipientRetention);
        details.put("refusal", "동의를 거부할 수 있으며, 거부하면 앱에서 예약을 접수할 수 없어요.");
        details.put("storeId", store.getId());
        details.put("sellerAddress", Objects.toString(store.getAddress(), ""));
        details.put("sellerPhone", Objects.toString(store.getPhone(), ""));
        details.put("depositAmount", store.getNoShowDeposit() == null ? 0 : store.getNoShowDeposit());
        details.put("fullRefundDays", store.getFullRefundDays());
        details.put("partialRefundDays", store.getPartialRefundDays());
        details.put("partialRefundRate", store.getPartialRefundRate());
        details.put("attendanceRefundEnabled", true);
        String digest = digest(VERSION + ":" + store.getOwner().getId() + ":" + encoded(details));
        return new Notice(true, VERSION, digest, details);
    }
    public Notice validate(Store lockedStore, Proof proof) {
        if (!enabled) return null;
        Notice notice = notice(lockedStore);
        if (proof == null || !proof.privacyAccepted() || !proof.conditionsAccepted())
            throw new ReservationException("예약 조건과 개인정보 제공 안내를 확인하고 동의해주세요.", HttpStatus.BAD_REQUEST);
        if (!VERSION.equals(proof.version()) || !notice.hash().equals(proof.noticeHash()))
            throw new ReservationException("예약 안내가 변경됐어요. 새 내용을 확인한 뒤 다시 신청해주세요.", HttpStatus.CONFLICT);
        return notice;
    }
    /** 예약 저장과 같은 트랜잭션에서만 동의 증거를 남긴다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Reservation reservation, Notice notice) {
        if (!enabled) return;
        if (notice == null || !notice.enabled()) throw new IllegalStateException("Missing reservation consent proof");
        LocalDateTime at = LocalDateTime.now(Clock.systemUTC());
        Map<String, Object> snapshot = new TreeMap<>(notice.details());
        snapshot.put("reservationCode", reservation.getReservationCode());
        snapshot.put("reservationDate", Objects.toString(reservation.getReservationDate(), ""));
        snapshot.put("reservationTime", Objects.toString(reservation.getReservationTime(), ""));
        snapshot.put("guestCount", reservation.getGuestCount());
        snapshot.put("depositAmount", reservation.getDepositAmount());
        jdbc.update("INSERT INTO reservation_consent (reservation_id,member_id,store_id,recipient_id,notice_version,notice_hash,notice_snapshot,privacy_accepted,conditions_accepted,accepted_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                reservation.getId(), reservation.getMember().getId(), reservation.getStore().getId(), reservation.getStore().getOwner().getId(),
                VERSION, notice.hash(), encoded(snapshot), true, true, at,
                later(at, kr.it.reserve.reservation.retention.ReservationPrivacyPolicy.usageEnd(reservation))
                        .plusYears(kr.it.reserve.reservation.retention.ReservationPrivacyPolicy.EVIDENCE_YEARS));
    }
    @jakarta.annotation.PostConstruct
    void checkEnabledSchema() {
        if (!enabled) return;
        if (!retentionEnabled) throw new IllegalStateException("Reservation consent requires verified retention activation");
        if (recipientRetention == null || recipientRetention.isBlank()) throw new IllegalStateException("Reservation consent retention must be approved before activation");
        jdbc.queryForList("SELECT reservation_id,member_id,store_id,recipient_id,notice_version,notice_hash,notice_snapshot,privacy_accepted,conditions_accepted,accepted_at,expires_at FROM reservation_consent WHERE 1=0");
    }
    private String encoded(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception failure) { throw new IllegalStateException("Cannot encode reservation consent notice", failure); }
    }
    private static LocalDateTime later(LocalDateTime acceptedUtc, LocalDateTime usageEndKst) {
        if (usageEndKst == null) return acceptedUtc;
        LocalDateTime endUtc = usageEndKst.atZone(kr.it.reserve.global.common.ServiceTime.ZONE)
                .withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        return endUtc.isAfter(acceptedUtc) ? endUtc : acceptedUtc;
    }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException(failure); }
    }
}
