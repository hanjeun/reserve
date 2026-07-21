package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 미결제 예약 자동 만료 스케줄러
 *
 * 예약금이 있는 가게에서 예약 후 결제를 완료하지 않은 경우,
 * 가게별 paymentTimeoutMinutes 설정 시간이 지나면 자동으로 CANCELLED 처리한다.
 *
 * 실행 주기: 5분마다
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationExpiryScheduler {

    private final ReservationRepository reservationRepository;

    // 조회 범위 버퍼: 최소 timeout(1분)보다 오래된 것만 조회
    private static final int QUERY_BUFFER_MINUTES = 1;

    @Scheduled(fixedDelay = 5 * 60 * 1000) // 5분마다 실행
    @Transactional
    public void expireUnpaidReservations() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(QUERY_BUFFER_MINUTES);

        List<Reservation> candidates = reservationRepository.findExpiredUnpaidReservations(cutoff);

        if (candidates.isEmpty()) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        int expiredCount = 0;

        for (Reservation reservation : candidates) {
            int timeoutMinutes = getTimeoutMinutes(reservation);
            LocalDateTime expireAt = reservation.getCreatedAt().plusMinutes(timeoutMinutes);

            if (now.isAfter(expireAt)) {
                log.info("[ExpiryScheduler] Unpaid reservation auto-cancelled: reservationId={}, storeId={}, memberId={}, createdAt={}, expireAt={}",
                        reservation.getId(),
                        reservation.getStore().getId(),
                        reservation.getMember().getId(),
                        reservation.getCreatedAt(),
                        expireAt);

                reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
                expiredCount++;
            }
        }

        if (expiredCount > 0) {
            log.info("[ExpiryScheduler] Auto-cancelled {} unpaid reservations", expiredCount);
        }
    }

    /**
     * 가게별 결제 대기 만료 시간 (분 단위)
     * store.paymentTimeoutMinutes 없으면 기본값 30분
     */
    private int getTimeoutMinutes(Reservation reservation) {
        Integer timeout = reservation.getStore().getPaymentTimeoutMinutes();
        return (timeout != null && timeout > 0) ? timeout : 30;
    }
}
