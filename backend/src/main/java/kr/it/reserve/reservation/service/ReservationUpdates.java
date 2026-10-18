package kr.it.reserve.reservation.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.reservation.entity.Reservation;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.HashSet;

@Component @RequiredArgsConstructor
public class ReservationUpdates {
    private final EntityUpdates updates;

    public void changed(Reservation reservation, EntityUpdates.Operation operation) {
        var recipients = new HashSet<Long>();
        if (reservation.getMember() != null) recipients.add(reservation.getMember().getId());
        if (reservation.getStore().getOwner() != null) recipients.add(reservation.getStore().getOwner().getId());
        recipients.remove(null);
        updates.publish(EntityUpdates.Domain.RESERVATION, reservation.getId(), null, reservation.getStore().getId(),
                operation, false, recipients, true);
    }
}
