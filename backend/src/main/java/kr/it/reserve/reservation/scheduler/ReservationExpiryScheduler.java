package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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
    private final ReservationExpiryProcessor expiryProcessor;

    // 조회 범위 버퍼: 최소 timeout(1분)보다 오래된 것만 조회
    private static final int QUERY_BUFFER_MINUTES = 1;

    @Scheduled(fixedDelay = 5 * 60 * 1000) // 5분마다 실행
    public void expireUnpaidReservations() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(QUERY_BUFFER_MINUTES);

        List<Reservation> candidates = reservationRepository.findExpiredUnpaidReservations(cutoff);

        if (candidates.isEmpty()) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        int expiredCount = 0;
        int recoveredCount = 0;
        int deferredCount = 0;

        for (Reservation candidate : candidates) {
            try {
                ReservationExpiryProcessor.ExpiryResult result =
                        expiryProcessor.expireIfDue(candidate.getId(), now);
                switch (result) {
                    case CANCELLED -> expiredCount++;
                    case PAYMENT_RECOVERED -> recoveredCount++;
                    case DEFERRED -> deferredCount++;
                    case SKIPPED -> {
                        // 조회 뒤 상태·설정이 바뀐 정상 경쟁. 아무것도 하지 않는다.
                    }
                }
            } catch (RuntimeException e) {
                // 한 예약의 예외가 배치 전체를 중단하거나 다른 결제의 잠금을 오래 잡게 하지 않는다.
                deferredCount++;
                log.error("[ExpiryScheduler] Candidate processing failed: reservationId={}, errorType={}",
                        candidate.getId(), e.getClass().getSimpleName());
            }
        }

        if (expiredCount > 0) {
            log.info("[ExpiryScheduler] Auto-cancelled {} unpaid reservations", expiredCount);
        }
        if (recoveredCount > 0 || deferredCount > 0) {
            log.info("[ExpiryScheduler] Payment recheck summary: recovered={}, deferred={}",
                    recoveredCount, deferredCount);
        }
    }

}
