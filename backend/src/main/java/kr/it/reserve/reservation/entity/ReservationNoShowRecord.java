package kr.it.reserve.reservation.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "reservation_no_show_record", indexes = {
        @Index(name = "idx_no_show_member_store_time", columnList = "member_id, store_id, corrected_at, confirmed_at"),
        @Index(name = "idx_no_show_confirmed_at", columnList = "confirmed_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReservationNoShowRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 예약을 휴지통에서 비워도 제한의 근거는 보관 기간 동안 남긴다.
    @Column(name = "reservation_id", nullable = false, unique = true, updatable = false)
    private Long reservationId;

    @Column(name = "member_id", nullable = false, updatable = false)
    private Long memberId;

    @Column(name = "store_id", nullable = false, updatable = false)
    private Long storeId;

    @Column(name = "confirmed_at", nullable = false)
    private LocalDateTime confirmedAt;

    @Column(name = "corrected_at")
    private LocalDateTime correctedAt;

    public ReservationNoShowRecord(Long reservationId, Long memberId, Long storeId, LocalDateTime confirmedAt) {
        this.reservationId = reservationId;
        this.memberId = memberId;
        this.storeId = storeId;
        this.confirmedAt = confirmedAt;
    }

    public boolean correct(LocalDateTime now) {
        if (correctedAt != null) return false;
        correctedAt = now;
        return true;
    }

    public void reconfirm(LocalDateTime now) {
        confirmedAt = now;
        correctedAt = null;
    }
}
