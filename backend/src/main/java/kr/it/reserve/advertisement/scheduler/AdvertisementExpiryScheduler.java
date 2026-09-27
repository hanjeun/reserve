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
     * 10분마다 실행하고 기동 30초 뒤에도 한 번 실행한다.
     * 일일 cron은 그 시각에 서버가 내려가 있으면 다음 날까지 놓치므로, 재기동 뒤에도 곧바로 따라잡는다.
     * 날짜 판정은 서비스 내부의 {@code ServiceTime.today()}가 KST로 고정한다.
     */
    @Scheduled(
            fixedDelayString = "${advertisement.expiry-scan-delay-ms:600000}",
            initialDelayString = "${advertisement.expiry-scan-initial-delay-ms:30000}")
    public void expireOverdueAds() {
        advertisementService.expireOverdueAds();
        // 결제되지 않은 채 시작일이 지난 신청도 같은 시각에 정리한다.
        // 별도 @Scheduled 로 나누지 않는 이유: 둘 다 "지나간 광고 정리"라는 한 가지 일이고,
        // 시각을 갈라두면 목록에 만료와 취소가 시차를 두고 나타나 사용자가 혼란스럽다.
        advertisementService.cancelUnpaidOverdueAds();
    }
}
