package kr.it.reserve.reservation.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.reservation.entity.Reservation;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.HashSet;

@Component @RequiredArgsConstructor
public class ReservationUpdates {
    public enum NotificationKind { APPROVED, CHANGED, CANCELLED }

    public interface NotificationSink {
        void enqueue(Reservation reservation, NotificationKind kind);
    }

    private final EntityUpdates updates;
    private final NotificationSink notifications;

    public void created(Reservation reservation) {
        if (reservation.getStatus() == Reservation.ReservationStatus.CONFIRMED) {
            notifications.enqueue(reservation, NotificationKind.APPROVED);
        }
        changed(reservation, EntityUpdates.Operation.CREATED);
    }

    public void approved(Reservation reservation) { notifyChange(reservation, NotificationKind.APPROVED); }
    public void rescheduled(Reservation reservation) { notifyChange(reservation, NotificationKind.CHANGED); }
    public void cancelled(Reservation reservation) { notifyChange(reservation, NotificationKind.CANCELLED); }

    private void notifyChange(Reservation reservation, NotificationKind kind) {
        notifications.enqueue(reservation, kind);
        updated(reservation);
    }

    public void updated(Reservation reservation) { changed(reservation, EntityUpdates.Operation.UPDATED); }

    public void deleted(Reservation reservation) { changed(reservation, EntityUpdates.Operation.DELETED); }

    public void changed(Reservation reservation, EntityUpdates.Operation operation) {
        var recipients = new HashSet<Long>();
        if (reservation.getMember() != null) recipients.add(reservation.getMember().getId());
        if (reservation.getStore().getOwner() != null) recipients.add(reservation.getStore().getOwner().getId());
        recipients.remove(null);
        updates.publish(EntityUpdates.Domain.RESERVATION, reservation.getId(), null, reservation.getStore().getId(),
                operation, false, recipients, true);
    }
}
