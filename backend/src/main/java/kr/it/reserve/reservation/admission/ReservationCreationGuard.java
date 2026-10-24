package kr.it.reserve.reservation.admission;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Runs inside ReservationService's member -> request -> store transaction. */
@Service @RequiredArgsConstructor @Slf4j
public class ReservationCreationGuard {
    private final ReservationRequestRepository requests;
    private final AdmissionService admission;
    public record Attempt(Long replayReservationId, Long memberId, String key, String hash) { }

    public Attempt begin(ReservationCreateRequest request, Long memberId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Reservation creation requires a transaction");
        String key = requestKey(request, false);
        String hash = fingerprint(request);
        if (key != null) {
            var prior = requests.findByMemberIdAndRequestKey(memberId, key);
            if (prior.isPresent()) {
                requireSameRequest(hash, prior.get().getRequestHash());
                return new Attempt(prior.get().getReservationId(), memberId, key, hash);
            }
        }
        var campaign = admission.match(request.getStoreId(), request.getReservationDate(), request.getReservationTime());
        if (campaign != null) {
            var claim = admission.claim(campaign, memberId, request.getAdmissionTicket(), key);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    try { admission.finish(claim, status == STATUS_COMMITTED); }
                    catch (RuntimeException e) {
                        // Commit is authoritative. The same request key recovers its DB result even if Redis is down.
                        log.warn("Admission completion reconciliation deferred: committed={}, errorType={}", status == STATUS_COMMITTED, e.getClass().getSimpleName());
                    }
                }
            });
        } else if (request.getAdmissionTicket() != null) {
            throw new ReservationException("선택한 예약의 입장권이 아니에요.", HttpStatus.CONFLICT);
        }
        return new Attempt(null, memberId, key, hash);
    }

    /** A missing committed result authorizes no write; the final creation boundary still decides admission. */
    public Long recover(ReservationCreateRequest request, Long memberId) {
        String key = requestKey(request, true);
        var prior = requests.findCommittedByMemberIdAndRequestKey(memberId, key);
        if (prior.isEmpty()) return null;
        requireSameRequest(fingerprint(request), prior.get().getRequestHash());
        return prior.get().getReservationId();
    }

    private static String requestKey(ReservationCreateRequest request, boolean required) {
        String key = request.getRequestId();
        if (key == null && required || key != null && !key.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
            throw new ReservationException("예약 요청 번호를 확인해주세요.");
        return key;
    }

    private static void requireSameRequest(String actual, String expected) {
        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII)))
            throw new ReservationException("이미 사용한 요청 번호예요. 기존 예약을 확인해주세요.", HttpStatus.CONFLICT);
    }

    public void saved(Attempt attempt, Long reservationId) {
        if (attempt.key() != null) requests.saveAndFlush(new ReservationRequest(attempt.memberId(), attempt.key(), attempt.hash(), reservationId));
    }

    static String fingerprint(ReservationCreateRequest r) {
        try {
            var bytes = new ByteArrayOutputStream();
            var out = new DataOutputStream(bytes);
            for (String value : new String[]{String.valueOf(r.getStoreId()), String.valueOf(r.getReservationDate()),
                    String.valueOf(r.getReservationTime()), String.valueOf(r.getGuestCount()), r.getSpecialRequest(),
                    Boolean.TRUE.equals(r.getSkipPayment()) ? "true" : "false"}) {
                if (value == null) out.writeInt(-1);
                else { byte[] field = value.getBytes(StandardCharsets.UTF_8); out.writeInt(field.length); out.write(field); }
            }
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        } catch (java.io.IOException | java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
