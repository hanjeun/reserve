package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.RefundDispatchService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationUpdates;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** 시간 경과 결정·환불 의도는 한 예약씩 커밋한다. 한 건의 실패가 배치 전체를 롤백하지 않는다. */
@Service
@RequiredArgsConstructor
public class ReservationElapsedProcessor {
    private final PaymentService payments;
    private final RefundDispatchService dispatch;
    @Autowired(required = false)
    private ReservationUpdates updates;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Result processOne(Long reservationId, LocalDateTime now) {
        Reservation reservation = payments.lockReservationPayments(reservationId);
        if (reservation == null || reservation.getDeletedAt() != null || reservation.getCheckedInAt() != null
                || (reservation.getStatus() != Reservation.ReservationStatus.PENDING
                    && reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED)
                || !LocalDateTime.of(reservation.getReservationDate(), reservation.getReservationTime()).isBefore(now)) {
            return Result.SKIPPED;
        }
        Result result;
        if (reservation.getStatus() == Reservation.ReservationStatus.PENDING) {
            reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
            reservation.setCancelReason("예약 시간이 지나도록 승인되지 않아 자동 취소됐어요.");
            if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
                dispatch.afterCommit(payments.prepareFullRefundByStoreDecision(
                        reservationId, "예약 시간 경과 - 미승인 자동 취소 전액 환불"));
            }
            result = Result.CANCELLED;
        } else {
            reservation.setStatus(Reservation.ReservationStatus.UNCONFIRMED);
            result = Result.UNCONFIRMED;
        }
        if (updates != null) updates.changed(reservation, EntityUpdates.Operation.UPDATED);
        return result;
    }

    public enum Result { CANCELLED, UNCONFIRMED, SKIPPED }
}
