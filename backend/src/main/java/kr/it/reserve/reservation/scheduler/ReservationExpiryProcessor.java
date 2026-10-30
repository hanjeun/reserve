package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationUpdates;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

/**
 * 미결제 예약 한 건의 만료 판정과 변경을 하나의 짧은 트랜잭션으로 처리한다.
 * 배치 전체가 PG 네트워크 대기와 결제 잠금을 공유하지 않게 스케줄러와 분리했다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReservationExpiryProcessor {

    private final ReservationRepository reservationRepository;
    private final PaymentService paymentService;
    private final PlatformTransactionManager transactionManager;
    @Autowired(required = false)
    private ReservationUpdates updates;

    @Transactional(propagation = Propagation.NEVER)
    public ExpiryResult expireIfDue(Long reservationId, LocalDateTime now) {
        Boolean candidate = new TransactionTemplate(transactionManager).execute(ignored -> {
            Reservation reservation = reservationRepository.findById(reservationId).orElse(null);
            return isDue(reservation, now);
        });
        if (!Boolean.TRUE.equals(candidate)) return ExpiryResult.SKIPPED;
        PaymentService.ExpiryPaymentObservation observation =
                paymentService.observeBeforeReservationExpiry(reservationId);
        return new TransactionTemplate(transactionManager).execute(ignored -> expireObserved(reservationId, now, observation));
    }

    private ExpiryResult expireObserved(Long reservationId, LocalDateTime now,
                                        PaymentService.ExpiryPaymentObservation observation) {
        if (!reservationRepository.existsById(reservationId)) {
            return ExpiryResult.SKIPPED;
        }
        Reservation reservation = paymentService.lockReservationPayments(reservationId);
        if (!isDue(reservation, now)) return ExpiryResult.SKIPPED;
        PaymentService.ExpiryPaymentDecision paymentDecision =
                paymentService.applyLockedExpiryPaymentObservation(reservation, observation);
        if (paymentDecision == PaymentService.ExpiryPaymentDecision.PAID_RECOVERED) {
            log.info("[ExpiryScheduler] Payment recovered before expiry: reservationId={}",
                    reservation.getId());
            return ExpiryResult.PAYMENT_RECOVERED;
        }
        if (paymentDecision == PaymentService.ExpiryPaymentDecision.UNCERTAIN) {
            log.warn("[ExpiryScheduler] Expiry deferred because payment state is uncertain: reservationId={}",
                    reservation.getId());
            return ExpiryResult.DEFERRED;
        }

        LocalDateTime expireAt = kr.it.reserve.reservation.service.ReservationPaymentPolicy.deadline(reservation);
        log.info("[ExpiryScheduler] Unpaid reservation auto-cancelled: reservationId={}, storeId={}, memberId={}, createdAt={}, expireAt={}",
                reservation.getId(),
                reservation.getStore().getId(),
                reservation.getMember().getId(),
                reservation.getCreatedAt(),
                expireAt);
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        if (updates != null) updates.changed(reservation, EntityUpdates.Operation.UPDATED);
        return ExpiryResult.CANCELLED;
    }

    private boolean isDue(Reservation reservation, LocalDateTime now) {
        if (!isStillCandidate(reservation)) return false;
        return kr.it.reserve.reservation.service.ReservationPaymentPolicy.expiredAt(reservation, now);
    }

    private boolean isStillCandidate(Reservation reservation) {
        return reservation != null
                && reservation.getStatus() == Reservation.ReservationStatus.PENDING
                && !Boolean.TRUE.equals(reservation.getDepositPaid())
                && reservation.getDepositAmount() != null
                && reservation.getDepositAmount() > 0
                && reservation.getStore() != null
                && !Boolean.TRUE.equals(reservation.getStore().getAllowLatePayment())
                && reservation.getCreatedAt() != null;
    }

    public enum ExpiryResult {
        CANCELLED,
        PAYMENT_RECOVERED,
        DEFERRED,
        SKIPPED
    }
}
