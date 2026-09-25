package kr.it.reserve.config.oauth2.outbox;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.EnumSet;

/** 자동 재시도 실패와 토큰 누락 작업을 Loki 알림이 잡을 수 있는 안정 문구로 보고한다. */
@Slf4j
@Component
@RequiredArgsConstructor
public class OAuthUnlinkOperationsMonitorScheduler {

    private final OAuthUnlinkTaskRepository taskRepository;

    @Scheduled(fixedDelay = 15 * 60 * 1000)
    public void reportUnresolvedTasks() {
        long unresolved = taskRepository.countByStatusIn(EnumSet.of(
                OAuthUnlinkTask.Status.FAILED,
                OAuthUnlinkTask.Status.BLOCKED));
        if (unresolved > 0) {
            log.error("OAuth unlink queue requires attention: unresolved={}", unresolved);
        }
    }
}
