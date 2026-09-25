package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.config.oauth2.OAuthUnlinkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class OAuthUnlinkTaskProcessor {

    private final OAuthUnlinkTaskStateService taskStateService;
    private final OAuthUnlinkTokenCipher tokenCipher;
    private final OAuthUnlinkService unlinkService;

    public void process(Long taskId, LocalDateTime now) {
        OAuthUnlinkTaskStateService.Claim claim = taskStateService.claim(taskId, now);
        if (claim == null) return;

        try {
            String accessToken = tokenCipher.decrypt(claim.encryptedAccessToken());
            if (unlinkService.unlink(claim.provider(), accessToken, claim.memberId())) {
                taskStateService.markCompleted(taskId, claim.leaseId(), now);
                log.info("Queued OAuth unlink completed: taskId={}, provider={}", taskId, claim.provider());
            } else {
                taskStateService.markFailed(taskId, claim.leaseId(), now, "REMOTE_REJECTED");
                log.warn("Queued OAuth unlink rejected: taskId={}, provider={}", taskId, claim.provider());
            }
        } catch (Exception exception) {
            taskStateService.markFailed(taskId, claim.leaseId(), now, exception.getClass().getSimpleName());
            log.warn("Queued OAuth unlink failed: taskId={}, provider={}, errorType={}",
                    taskId, claim.provider(), exception.getClass().getSimpleName());
        }
    }
}
