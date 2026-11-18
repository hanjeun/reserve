package kr.it.reserve.notification.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationUpdates.NotificationKind;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Getter
@NoArgsConstructor
@Table(name = "reservation_notification",
        uniqueConstraints = @UniqueConstraint(name = "uk_reservation_notification_event_recipient",
                columnNames = {"event_key", "recipient_id"}),
        indexes = {
            @Index(name = "idx_reservation_notification_due", columnList = "next_attempt_at, id"),
            @Index(name = "idx_reservation_notification_inbox", columnList = "recipient_id, id"),
            @Index(name = "idx_reservation_notification_unread", columnList = "recipient_id, read_at, delivered_at")
        })
public class ReservationNotification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_key", nullable = false, length = 36, updatable = false)
    private String eventKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Member recipient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reservation_id", nullable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Reservation reservation;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16, updatable = false)
    private NotificationKind kind;

    @Column(name = "owner_notice", nullable = false, updatable = false)
    private boolean ownerNotice;

    @Column(name = "store_name", nullable = false, updatable = false)
    private String storeName;

    @Column(name = "reservation_date", nullable = false, updatable = false)
    private LocalDate reservationDate;

    @Column(name = "reservation_time", nullable = false, updatable = false)
    private LocalTime reservationTime;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "next_attempt_at")
    private LocalDateTime nextAttemptAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    public static ReservationNotification pending(String eventKey, Reservation reservation, Member recipient,
                                                  NotificationKind kind, boolean ownerNotice, LocalDateTime now) {
        ReservationNotification item = new ReservationNotification();
        item.eventKey = eventKey;
        item.reservation = reservation;
        item.recipient = recipient;
        item.kind = kind;
        item.ownerNotice = ownerNotice;
        item.storeName = reservation.getStore().getName();
        item.reservationDate = reservation.getReservationDate();
        item.reservationTime = reservation.getReservationTime();
        item.createdAt = now;
        item.nextAttemptAt = now;
        return item;
    }

    public void deliver(LocalDateTime now) {
        deliveredAt = now;
        nextAttemptAt = null;
    }

    public void defer(LocalDateTime now) {
        attempts = Math.min(attempts + 1, 6);
        nextAttemptAt = now.plusSeconds(Math.min(300, 5L << attempts));
    }
}
