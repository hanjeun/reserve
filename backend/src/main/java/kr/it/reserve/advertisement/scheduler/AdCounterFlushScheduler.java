package kr.it.reserve.advertisement.scheduler;

import kr.it.reserve.advertisement.service.AdvertisementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 광고 노출/클릭/전환 카운터를 주기적으로 DB에 flush (2026-07 추가).
 *
 * AdCounterBuffer에 인메모리로 쌓인 값을 30초마다 걷어서 반영한다 — RateLimiter처럼
 * 인스턴스별 독립이라 Blue/Green 전환 순간의 미반영분은 유실될 수 있지만, 결제/정산과
 * 무관한 장식적 지표라 감수 가능한 트레이드오프로 남겨둔다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdCounterFlushScheduler {

    private final AdvertisementService advertisementService;

    @Scheduled(fixedRate = 30_000)
    public void flush() {
        advertisementService.flushCounters();
    }
}
