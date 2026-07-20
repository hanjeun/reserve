package com.reserve.advertisement.scheduler;

import com.reserve.advertisement.service.AdvertisementService;
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
    }
}
