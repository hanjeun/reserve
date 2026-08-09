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
            Integer timeoutMinutes = getTimeoutMinutes(reservation);

            // ★ null = 제한 없음 — 이 가게는 미결제 예약을 자동 취소하지 않는다(2026-08-09 신설).
            //   예전엔 프론트가 "제한 없음"을 1440분으로 보냈는데 그건 사실 24시간 자동취소였고,
            //   0 을 보내면 아래 `> 0` 가드에 걸려 오히려 기본값 30분으로 돌아갔다 —
            //   어느 쪽으로도 진짜 무제한이 불가능했다.
            if (timeoutMinutes == null) continue;

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
     * 가게별 결제 대기 만료 시간 (분 단위).
     *
     * @return 만료 분. <b>{@code null} 이면 "제한 없음"</b> — 자동 취소하지 않는다.
     *         값이 없으면(예전 데이터) 기본 30분.
     *
     * <p>⚠️ "제한 없음"을 고른 가게는 미결제 예약이 슬롯을 계속 점유한다.
     * 예약금을 받는 가게가 이걸 고르면 자리만 막히고 돈은 안 들어오는 상태가 될 수 있다.
     */
    private Integer getTimeoutMinutes(Reservation reservation) {
        Integer timeout = reservation.getStore().getPaymentTimeoutMinutes();
        if (timeout == null) return 30;
        if (timeout <= 0) return null;   // 0 = 제한 없음 (StoreService.PAYMENT_TIMEOUT_UNLIMITED)
        return timeout;
    }
}
