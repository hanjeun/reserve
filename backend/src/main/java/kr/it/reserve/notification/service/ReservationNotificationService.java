package kr.it.reserve.notification.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.notification.entity.ReservationNotification;
import kr.it.reserve.notification.repository.ReservationNotificationRepository;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationUpdates.NotificationKind;
import kr.it.reserve.reservation.service.ReservationUpdates.NotificationSink;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ReservationNotificationService implements NotificationSink {
    public static final int PAGE_SIZE = 20;
    private final ReservationNotificationRepository notifications;
    private final EntityUpdates updates;

    /** 알림은 업무 트랜잭션에서 대기 상태로 저장되고 전달 후에만 받은편지함에 나타난다. */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(Reservation reservation, NotificationKind kind) {
        String eventKey = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(Clock.systemUTC());
        Member customer = reservation.getMember();
        notifications.save(ReservationNotification.pending(eventKey, reservation, customer, kind, false, now));
        Member owner = reservation.getStore().getOwner();
        if (kind != NotificationKind.APPROVED && owner != null && !Objects.equals(owner.getId(), customer.getId())) {
            notifications.save(ReservationNotification.pending(eventKey, reservation, owner, kind, true, now));
        }
    }

    @Transactional(readOnly = true)
    public List<Long> due(LocalDateTime now) {
        return notifications.due(now, PageRequest.of(0, 50));
    }

    @Transactional
    public void deliver(Long id, LocalDateTime now) {
        var item = notifications.pendingForUpdate(id).orElse(null);
        if (item == null || item.getNextAttemptAt().isAfter(now)) return;

        Member recipient = item.getRecipient();
        Reservation reservation = item.getReservation();
        Member currentRecipient = item.isOwnerNotice() ? reservation.getStore().getOwner() : reservation.getMember();
        if (recipient.isDeleted() || recipient.isSuspended() || !recipient.isTermsAgreed()
                || reservation.isDeleted() || currentRecipient == null || !Objects.equals(currentRecipient.getId(), recipient.getId())
                || (item.isOwnerNotice() && !canManage(recipient))) {
            notifications.delete(item);
            return;
        }
        item.deliver(now);
        signal(recipient.getId());
    }

    @Transactional
    public void defer(Long id, LocalDateTime now) {
        notifications.pendingForUpdate(id)
                .filter(item -> !item.getNextAttemptAt().isAfter(now))
                .ifPresent(item -> item.defer(now));
    }

    @Transactional(readOnly = true)
    public InboxPage inbox(Member member, Long before) {
        var result = notifications.inbox(member.getId(), canManage(member), before, PageRequest.of(0, PAGE_SIZE + 1));
        var items = result.stream().limit(PAGE_SIZE).map(Item::from).toList();
        return new InboxPage(items, result.size() > PAGE_SIZE ? items.getLast().id() : null);
    }

    @Transactional(readOnly = true)
    public long unread(Member member) {
        return notifications.unread(member.getId(), canManage(member));
    }

    @Transactional
    public int read(Member member, List<Long> ids) {
        return markRead(member, ids);
    }

    @Transactional
    public ReadCount readWithCount(Member member, List<Long> ids) {
        int changed = markRead(member, ids);
        return new ReadCount(changed, unread(member));
    }

    private int markRead(Member member, List<Long> ids) {
        int changed = notifications.markRead(member.getId(), canManage(member), ids, LocalDateTime.now(Clock.systemUTC()));
        if (changed > 0) signal(member.getId());
        return changed;
    }

    @Transactional(readOnly = true)
    public ReservationResponse reservation(Member member, Long notificationId) {
        return notifications.visible(member.getId(), canManage(member), notificationId)
                .map(item -> item.isOwnerNotice() ? ReservationResponse.fromManagementEntity(item.getReservation())
                        : ReservationResponse.fromEntity(item.getReservation()))
                .orElseThrow(ReservationException::notFound);
    }

    private void signal(Long recipientId) {
        updates.publish(EntityUpdates.Domain.SYSTEM_NOTIFICATION, 0L, null, null,
                EntityUpdates.Operation.INVALIDATED, false, Set.of(recipientId), false);
    }

    private static boolean canManage(Member member) {
        return member.isBusiness() || member.isAdmin();
    }

    public record InboxPage(List<Item> items, Long nextBefore) {}
    public record ReadCount(int changed, long unread) {}

    public record Item(Long id, NotificationKind kind, boolean ownerNotice, String storeName, LocalDate reservationDate,
                       LocalTime reservationTime, Instant createdAt, boolean read) {
        static Item from(ReservationNotification item) {
            return new Item(item.getId(), item.getKind(), item.isOwnerNotice(), item.getStoreName(),
                    item.getReservationDate(), item.getReservationTime(), item.getCreatedAt().toInstant(ZoneOffset.UTC),
                    item.getReadAt() != null);
        }
    }
}
