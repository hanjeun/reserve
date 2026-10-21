package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
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
    private final ReservationElapsedProcessor processor;

    /**
     * ★ 예약 날짜·시각은 이용자에게 보이는 그대로 저장된 <b>KST</b> 값이다.
     * 앱 컨테이너에는 TZ 설정이 없어 {@code LocalDateTime.now()} 가 UTC 로 나오는데,
     * 그대로 비교하면 9시간이 어긋나 <b>아직 오지 않은 예약을 취소하고 환불까지 해버린다.</b>
     * (QrCheckinTokenProvider 가 같은 이유로 SERVICE_ZONE 을 쓴다 — 같은 함정이다.)
     */
    // 값은 ServiceTime 한 곳에서만 정한다 — 예전엔 이 상수가 여기와 QrCheckinTokenProvider 에
    // 따로 복사돼 있었고, 규칙은 두 파일 주석에만 있어서 나머지 열 몇 곳이 조용히 UTC 로 돌았다.
    private static final ZoneId SERVICE_ZONE = ServiceTime.ZONE;

    /**
     * 한 번에 처리할 최대 건수. 첫 배포 때 밀린 과거 예약이 한꺼번에 걸릴 수 있는데,
     * 예약별 결정은 독립 트랜잭션으로 저장하고 환불 API는 커밋 후 호출한다.
     * 10분마다 도니 밀린 건은 몇 사이클에 걸쳐 빠진다.
     */
    private static final int BATCH_SIZE = 100;

    @Scheduled(fixedDelay = 10 * 60 * 1000)
    @Transactional(propagation = Propagation.NEVER)
    public void processElapsedReservations() {
        LocalDateTime now = LocalDateTime.now(SERVICE_ZONE);

        List<Reservation> elapsed = reservationRepository.findElapsedActiveReservations(
                now.toLocalDate(), now.toLocalTime(), PageRequest.of(0, BATCH_SIZE));

        if (elapsed.isEmpty()) return;

        int cancelled = 0;
        int unconfirmed = 0;
        int failed = 0;
        for (Reservation reservation : elapsed) {
            try {
                switch (processor.processOne(reservation.getId(), now)) {
                    case CANCELLED -> cancelled++;
                    case UNCONFIRMED -> unconfirmed++;
                    case SKIPPED -> { }
                }
            } catch (RuntimeException e) {
                failed++;
                log.error("[ElapsedScheduler] Reservation processing deferred: reservationId={}, errorType={}",
                        reservation.getId(), e.getClass().getSimpleName());
            }
        }
        log.info("[ElapsedScheduler] processed {} candidates: {} cancelled, {} unconfirmed, {} failed",
                elapsed.size(), cancelled, unconfirmed, failed);
        if (elapsed.size() == BATCH_SIZE) {
            log.warn("[ElapsedScheduler] batch was full ({}) - more remain, will continue next run", BATCH_SIZE);
        }
    }
}
