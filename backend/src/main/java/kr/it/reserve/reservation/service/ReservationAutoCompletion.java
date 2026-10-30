package kr.it.reserve.reservation.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.RefundDispatchService;
import kr.it.reserve.reservation.entity.Reservation;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReservationAutoCompletion {
    private final PaymentService payments;
    private final RefundDispatchService refunds;
    private final ReservationUpdates updates;

    @Transactional
    public boolean complete(Long id) {
        var reservation = payments.lockReservationPayments(id);
        if (!Boolean.TRUE.equals(reservation.getAutoCompletionEnabled()) || reservation.getCheckedInAt() == null
                || reservation.getDeletedAt() != null || !ReservationAccess.approved(reservation)
                || reservation.getUsageEndsAt() == null || reservation.getUsageEndsAt().isAfter(ServiceTime.now())) return false;
        reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
        refunds.afterCommit(payments.prepareFullRefundAfterAttendance(id));
        updates.changed(reservation, EntityUpdates.Operation.UPDATED);
        return true;
    }
}
