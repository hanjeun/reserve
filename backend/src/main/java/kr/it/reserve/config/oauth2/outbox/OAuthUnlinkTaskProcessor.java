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

        String accessToken;
        try {
            accessToken = tokenCipher.decrypt(claim.encryptedAccessToken());
        } catch (Exception exception) {
            taskStateService.markBlocked(taskId, claim.leaseId(), now, "TOKEN_DECRYPTION_ERROR");
            log.warn("Queued OAuth unlink blocked: taskId={}, provider={}, errorType={}",
                    taskId, claim.provider(), exception.getClass().getSimpleName());
            return;
        }
        // DB 상태 전환 실패는 lease 회수로 다시 처리한다. 원격 영구 오류와 혼동해 BLOCKED로 만들지 않는다.
        OAuthUnlinkService.Result result = unlinkService.unlinkWithResult(
                claim.provider(), accessToken, claim.memberId());
        switch (result.outcome()) {
            case COMPLETED -> {
                taskStateService.markCompleted(taskId, claim.leaseId(), now);
                log.info("Queued OAuth unlink completed: taskId={}, provider={}", taskId, claim.provider());
            }
            case RETRYABLE -> taskStateService.markFailed(
                    taskId, claim.leaseId(), now, result.errorType());
            case BLOCKED -> {
                taskStateService.markBlocked(taskId, claim.leaseId(), now, result.errorType());
                log.warn("Queued OAuth unlink blocked: taskId={}, provider={}, errorType={}",
                        taskId, claim.provider(), result.errorType());
            }
        }
    }
}
