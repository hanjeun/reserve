package kr.it.reserve.reservation.scheduler;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final EntityManager entityManager;

    @Transactional
    public ExpiryResult expireIfDue(Long reservationId, LocalDateTime now) {
        Reservation reservation = reservationRepository.findById(reservationId).orElse(null);
        if (!isStillCandidate(reservation)) {
            return ExpiryResult.SKIPPED;
        }

        Integer timeoutMinutes = getTimeoutMinutes(reservation);
        if (timeoutMinutes == null) {
            return ExpiryResult.SKIPPED;
        }

        LocalDateTime expireAt = reservation.getCreatedAt().plusMinutes(timeoutMinutes);
        if (!now.isAfter(expireAt)) {
            return ExpiryResult.SKIPPED;
        }

        PaymentService.ExpiryPaymentDecision paymentDecision =
                paymentService.reconcileBeforeReservationExpiry(reservation.getId());
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

        // 결제 행을 먼저 잠근 다음 예약 행을 잠그고 최신 상태로 새로 읽는다.
        // 후보 조회 뒤 사업자가 승인했거나 다른 경로가 결제를 반영한 예약을 stale 값으로 취소하지 않는다.
        entityManager.refresh(reservation, LockModeType.PESSIMISTIC_WRITE);
        if (!isStillCandidate(reservation)) {
            return ExpiryResult.SKIPPED;
        }
        timeoutMinutes = getTimeoutMinutes(reservation);
        if (timeoutMinutes == null) {
            return ExpiryResult.SKIPPED;
        }
        expireAt = reservation.getCreatedAt().plusMinutes(timeoutMinutes);
        if (!now.isAfter(expireAt)) {
            return ExpiryResult.SKIPPED;
        }

        log.info("[ExpiryScheduler] Unpaid reservation auto-cancelled: reservationId={}, storeId={}, memberId={}, createdAt={}, expireAt={}",
                reservation.getId(),
                reservation.getStore().getId(),
                reservation.getMember().getId(),
                reservation.getCreatedAt(),
                expireAt);
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        return ExpiryResult.CANCELLED;
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

    /**
     * @return 만료 분. {@code null}이면 제한 없음. 값이 없는 예전 데이터는 기본 30분.
     */
    private Integer getTimeoutMinutes(Reservation reservation) {
        Integer timeout = reservation.getStore().getPaymentTimeoutMinutes();
        if (timeout == null) {
            return 30;
        }
        return timeout <= 0 ? null : timeout;
    }

    public enum ExpiryResult {
        CANCELLED,
        PAYMENT_RECOVERED,
        DEFERRED,
        SKIPPED
    }
}
