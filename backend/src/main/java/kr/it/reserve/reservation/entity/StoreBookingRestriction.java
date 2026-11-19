package kr.it.reserve.reservation.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "store_booking_restriction",
        uniqueConstraints = @UniqueConstraint(name = "uk_store_booking_restriction", columnNames = {"store_id", "member_id"}),
        indexes = @Index(name = "idx_store_booking_restriction_expiry", columnList = "ends_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreBookingRestriction {
    // 기존 DATETIME과 종료 시각 비교를 유지해 구버전에서도 새 예약을 제한한다.
    public static final LocalDateTime PERMANENT_UNTIL = LocalDateTime.of(9999, 12, 31, 23, 59, 59);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "store_id", nullable = false, updatable = false)
    private Long storeId;

    @Column(name = "member_id", nullable = false, updatable = false)
    private Long memberId;

    @Column(name = "ends_at", nullable = false)
    private LocalDateTime endsAt;

    @Column(nullable = false, length = 200)
    private String reason;

    public StoreBookingRestriction(Long storeId, Long memberId, LocalDateTime endsAt, String reason) {
        this.storeId = storeId;
        this.memberId = memberId;
        limitUntil(endsAt, reason);
    }

    public void limitUntil(LocalDateTime until, String reason) {
        this.endsAt = until;
        this.reason = reason;
    }
}
