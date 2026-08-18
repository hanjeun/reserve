package kr.it.reserve.advertisement.scheduler;

import kr.it.reserve.advertisement.service.AdvertisementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AdvertisementExpiryScheduler {

    private final AdvertisementService advertisementService;

    /**
     * endDate 지난 ACTIVE 광고를 EXPIRED로 자동 전환
     * 매일 새벽 4시 30분 실행 (RefreshToken 정리 4시와 겹치지 않게)
     */
    @Scheduled(cron = "0 30 4 * * *")
    public void expireOverdueAds() {
        advertisementService.expireOverdueAds();
        // 결제되지 않은 채 시작일이 지난 신청도 같은 시각에 정리한다.
        // 별도 @Scheduled 로 나누지 않는 이유: 둘 다 "지나간 광고 정리"라는 한 가지 일이고,
        // 시각을 갈라두면 목록에 만료와 취소가 시차를 두고 나타나 사용자가 혼란스럽다.
        advertisementService.cancelUnpaidOverdueAds();
    }
}
