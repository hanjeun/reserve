package com.reserve.config.jwt.scheduler;

import com.reserve.config.jwt.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class RefreshTokenCleanupScheduler {

    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * 만료된 Refresh Token 자동 정리
     * 매일 새벽 4시 실행 (AuditLog 정리와 겹치지 않게 1시간 차이)
     */
    @Scheduled(cron = "0 0 4 * * *")
    @Transactional
    public void cleanupExpiredTokens() {
        int deleted = refreshTokenRepository.deleteByExpiresAtBefore(LocalDateTime.now());
        log.info("Refresh token cleanup: {} expired tokens deleted", deleted);
    }
}
