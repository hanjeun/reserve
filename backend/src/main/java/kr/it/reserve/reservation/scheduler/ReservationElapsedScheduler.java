package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * 예약 시각이 지난 예약을 정리한다 (2026-08-11 신설).
 *
 * <p>그 전까지 예약은 <b>시간이 지나도 상태가 그대로였다.</b> 사장님이 아무것도 안 하면
 * PENDING·CONFIRMED 로 영원히 남았고, 특히 <b>PENDING 은 예약금을 낸 채로 방치</b>됐다 —
 * 승인이 안 됐으니 서비스는 제공되지 않았는데 돈은 가게에 남아 있는 상태다.
 *
 * <h3>처리 규칙</h3>
 * <table>
 *   <tr><td>PENDING</td><td>→ CANCELLED + <b>전액 환불</b></td></tr>
 *   <tr><td>CONFIRMED</td><td>→ UNCONFIRMED (돈은 건드리지 않음)</td></tr>
 * </table>
 *
 * <p><b>PENDING 이 전액 환불인 이유</b> — 승인 자체가 안 됐다. 이용자는 자리를 받지 못했고
 * 취소를 선택한 것도 아니다. 위약금 정책({@code calculateRefundAmount})은 "이용자가 마음을
 * 바꿔 취소할 때"의 규칙이라 여기에 태우면 안 된다. 가게 거절·취소와 같은 전액 경로를 쓴다.
 *
 * <p><b>CONFIRMED 가 자동 COMPLETED 가 아닌 이유</b> — 서버는 손님이 실제로 왔는지 모른다.
 * 자동 완료 처리하면 오지 않은 손님까지 이용완료가 되어 노쇼 통계가 무너지고, 노쇼로 넘기면
 * 실제로 방문한 손님을 벌하게 된다. 사실("시간이 지났는데 처리가 안 됨")만 기록한다.
 *
 * <p>실행 주기: 10분마다. 5분인 {@link ReservationExpiryScheduler} 와 어긋나게 두어
 * 두 스케줄러가 같은 순간에 같은 행을 건드릴 확률을 낮춘다(둘의 대상은 겹치지 않지만
 * PENDING 이라는 상태를 공유한다).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationElapsedScheduler {

    private final ReservationRepository reservationRepository;
    private final PaymentService paymentService;

    /**
     * ★ 예약 날짜·시각은 이용자에게 보이는 그대로 저장된 <b>KST</b> 값이다.
     * 앱 컨테이너에는 TZ 설정이 없어 {@code LocalDateTime.now()} 가 UTC 로 나오는데,
     * 그대로 비교하면 9시간이 어긋나 <b>아직 오지 않은 예약을 취소하고 환불까지 해버린다.</b>
     * (QrCheckinTokenProvider 가 같은 이유로 SERVICE_ZONE 을 쓴다 — 같은 함정이다.)
     */
    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    /**
     * 한 번에 처리할 최대 건수. 첫 배포 때 밀린 과거 예약이 한꺼번에 걸릴 수 있는데,
     * 그걸 한 트랜잭션에 몰아넣으면 환불 API 를 수백 번 연속 호출하게 된다.
     * 10분마다 도니 밀린 건은 몇 사이클에 걸쳐 빠진다.
     */
    private static final int BATCH_SIZE = 100;

    @Scheduled(fixedDelay = 10 * 60 * 1000)
    @Transactional
    public void processElapsedReservations() {
        LocalDateTime now = LocalDateTime.now(SERVICE_ZONE);

        List<Reservation> elapsed = reservationRepository.findElapsedActiveReservations(
                now.toLocalDate(), now.toLocalTime(), PageRequest.of(0, BATCH_SIZE));

        if (elapsed.isEmpty()) return;

        int cancelled = 0;
        int unconfirmed = 0;

        for (Reservation reservation : elapsed) {
            if (reservation.getStatus() == Reservation.ReservationStatus.PENDING) {
                cancelExpiredPending(reservation);
                cancelled++;
            } else {
                reservation.setStatus(Reservation.ReservationStatus.UNCONFIRMED);
                unconfirmed++;
            }
        }

        log.info("[ElapsedScheduler] processed {} reservations: {} cancelled+refunded (was PENDING), {} marked unconfirmed (was CONFIRMED)",
                elapsed.size(), cancelled, unconfirmed);

        // 배치가 가득 찼다는 건 아직 남았다는 뜻이다. 조용히 넘기면 "다 처리됐겠거니" 하게 된다.
        if (elapsed.size() == BATCH_SIZE) {
            log.warn("[ElapsedScheduler] batch was full ({}) - more remain, will continue next run", BATCH_SIZE);
        }
    }

    /**
     * 승인되지 않은 채 시간이 지난 예약을 취소하고 전액 환불한다.
     *
     * <p>순서가 중요하다 — 상태를 먼저 확정하고 환불은 뒤에 시도한다.
     * PG 장애로 환불이 실패해도 <b>취소는 남아야</b> 자리가 풀리고 이용자 화면이 정확해진다.
     * ({@code refundFullByStoreDecision} 이 REQUIRES_NEW 라 실패해도 이 트랜잭션은 안 죽는다.)
     *
     * <p>환불이 실제로 일어났을 때만 예약금 플래그를 지운다 — "예외가 안 났다"와
     * "돈이 돌아갔다"는 다르다. 지우지 않고 두면 정산이 안 끝난 건으로 눈에 띈다.
     */
    private void cancelExpiredPending(Reservation reservation) {
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        reservation.setCancelReason("예약 시간이 지나도록 승인되지 않아 자동 취소되었습니다.");

        if (!Boolean.TRUE.equals(reservation.getDepositPaid())) return;

        try {
            boolean refunded = paymentService.refundFullByStoreDecision(
                    reservation.getId(), "예약 시간 경과 - 미승인 자동 취소 전액 환불");
            if (refunded) {
                reservation.setDepositPaid(false);
                reservation.setDepositAmount(0);
            } else {
                log.error("[ElapsedScheduler] deposit marked paid but no refundable payment - needs manual settlement: reservationId={}",
                        reservation.getId());
            }
        } catch (Exception e) {
            // ⚠️ 환불 재시도 원장이 아직 없다 — 이 로그가 유일한 추적 수단이다.
            log.error("[ElapsedScheduler] refund failed - reservation stays CANCELLED, refund needs manual action: reservationId={}",
                    reservation.getId(), e);
        }
    }
}
