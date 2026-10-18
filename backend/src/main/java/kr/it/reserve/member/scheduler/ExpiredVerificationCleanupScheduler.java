package kr.it.reserve.member.scheduler;

import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExpiredVerificationCleanupScheduler {
    private final EmailVerificationRepository emailVerifications;
    private final PasswordResetTokenRepository passwordResets;

    // 발급·소비와 같은 DB 시계를 쓴다. OAuth 사건의 재생 방지 기록은 삭제하지 않는다.
    @Scheduled(cron = "0 20 4 * * *")
    @Transactional
    public void cleanupExpiredVerifications() {
        LocalDateTime cutoff = LocalDateTime.now(Clock.systemDefaultZone());
        int signup = emailVerifications.deleteExpiredVerifications(cutoff);
        int reset = passwordResets.deleteExpired(cutoff);
        log.info("Verification cleanup: signupDeleted={}, passwordResetDeleted={}", signup, reset);
    }
}
