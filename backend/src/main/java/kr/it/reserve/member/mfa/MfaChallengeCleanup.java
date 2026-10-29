package kr.it.reserve.member.mfa;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class MfaChallengeCleanup {
    private final MfaChallengeRepository challenges;
    @Scheduled(fixedDelayString = "${reserve.mfa.cleanup-delay-ms:300000}")
    @Transactional
    public void cleanup() {
        var expired = challenges.findTop200ByExpiresAtBefore(LocalDateTime.now(Clock.systemUTC()));
        if (!expired.isEmpty()) challenges.deleteAllInBatch(expired);
    }
}
