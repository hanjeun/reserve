package kr.it.reserve.reservation.scheduler;

import kr.it.reserve.global.common.ServiceTime;
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
 * 방문 시각이 지난 PENDING은 취소·전액 환불 경로로, CONFIRMED는 UNCONFIRMED로 정리한다.
 * 미승인 예약은 이용자 변심 위약금 정책을 적용하지 않는다.
 * 확정 예약의 실제 방문 여부는 시간 경과만으로 알 수 없으므로 자동 이용완료·노쇼로 만들지 않는다.
 * 예약별 결정은 독립적으로 처리하고 환불 호출은 커밋 뒤에 수행한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationElapsedScheduler {

    private final ReservationRepository reservationRepository;
    private final ReservationElapsedProcessor processor;

    /**
     * 예약 날짜·시각은 이용자에게 보이는 그대로 저장된 <b>KST</b> 값이다.
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
    private final ReservationCandidateCursor cursor = new ReservationCandidateCursor(BATCH_SIZE);

    @Scheduled(fixedDelay = 10 * 60 * 1000)
    @Transactional(propagation = Propagation.NEVER)
    public synchronized void processElapsedReservations() {
        LocalDateTime now = LocalDateTime.now(SERVICE_ZONE);

        List<Long> elapsed = cursor.next(reservationRepository::findMaximumReservationId,
                (afterId, throughId) -> reservationRepository.findElapsedActiveReservationIds(
                        now.toLocalDate(), now.toLocalTime(), afterId, throughId, PageRequest.of(0, BATCH_SIZE)));

        if (elapsed.isEmpty()) return;

        int cancelled = 0;
        int unconfirmed = 0;
        int failed = 0;
        for (Long reservationId : elapsed) {
            try {
                switch (processor.processOne(reservationId, now)) {
                    case CANCELLED -> cancelled++;
                    case UNCONFIRMED -> unconfirmed++;
                    case SKIPPED -> { }
                }
            } catch (RuntimeException e) {
                failed++;
                log.error("[ElapsedScheduler] Reservation processing deferred: reservationId={}, errorType={}",
                        reservationId, e.getClass().getSimpleName());
            }
        }
        log.info("[ElapsedScheduler] processed {} candidates: {} cancelled, {} unconfirmed, {} failed",
                elapsed.size(), cancelled, unconfirmed, failed);
        if (elapsed.size() == BATCH_SIZE) {
            log.warn("[ElapsedScheduler] batch was full ({}) - more remain, will continue next run", BATCH_SIZE);
        }
    }
}
