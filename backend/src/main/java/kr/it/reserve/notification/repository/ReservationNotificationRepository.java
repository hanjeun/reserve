package kr.it.reserve.notification.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.notification.entity.ReservationNotification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ReservationNotificationRepository extends JpaRepository<ReservationNotification, Long> {
    String RESERVATION_ACCESS = """
            r.deletedAt is null
              and ((n.ownerNotice = false and r.member.id = :memberId)
                or (n.ownerNotice = true and :canManage = true and s.owner.id = :memberId))
            """;
    String VISIBLE = """
            from ReservationNotification n join n.reservation r join r.store s
            where n.recipient.id = :memberId and n.deliveredAt is not null and
            """ + RESERVATION_ACCESS;

    @Query("select n " + VISIBLE + " and (:before is null or n.id < :before) order by n.id desc")
    List<ReservationNotification> inbox(Long memberId, boolean canManage, Long before, Pageable page);

    @Query("select n " + VISIBLE + " and n.id = :id")
    Optional<ReservationNotification> visible(Long memberId, boolean canManage, Long id);

    @Query("select count(n) " + VISIBLE + " and n.readAt is null")
    long unread(Long memberId, boolean canManage);

    @Modifying
    @Query("""
            update ReservationNotification n set n.readAt = :now
            where n.recipient.id = :memberId and n.id in :ids and n.readAt is null and n.deliveredAt is not null
              and exists (select 1 from Reservation r join r.store s where r.id = n.reservation.id and
            """ + RESERVATION_ACCESS + ")")
    int markRead(Long memberId, boolean canManage, List<Long> ids, LocalDateTime now);

    @Query("""
            select n.id from ReservationNotification n
            where n.nextAttemptAt <= :now order by n.nextAttemptAt, n.id
            """)
    List<Long> due(LocalDateTime now, Pageable page);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from ReservationNotification n where n.id = :id and n.nextAttemptAt is not null")
    Optional<ReservationNotification> pendingForUpdate(Long id);
}
