package kr.it.reserve.reservation.admission;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "reservation_request", uniqueConstraints = @UniqueConstraint(name = "uk_reservation_request_member_key", columnNames = {"member_id", "request_key"}))
@Getter @NoArgsConstructor
public class ReservationRequest {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "request_id")
    private Long id;
    @Column(name = "member_id", nullable = false)
    private Long memberId;
    @Column(name = "request_key", nullable = false, length = 36)
    private String requestKey;
    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;
    @Column(name = "reservation_id", nullable = false)
    private Long reservationId;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public ReservationRequest(Long memberId, String key, String hash, Long reservationId) {
        this.memberId = memberId; this.requestKey = key; this.requestHash = hash;
        this.reservationId = reservationId; this.createdAt = Instant.now();
    }
}
