package kr.it.reserve.config.oauth2.outbox;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.EnumSet;

@Component
@RequiredArgsConstructor
public class OAuthUnlinkScheduler {

    private static final int BATCH_SIZE = 10;
    private final OAuthUnlinkTaskRepository taskRepository;
    private final OAuthUnlinkTaskProcessor taskProcessor;

    @Scheduled(fixedDelayString = "${oauth.unlink.fixed-delay-ms:60000}")
    public void processQueuedUnlinks() {
        LocalDateTime now = LocalDateTime.now();
        taskRepository.findRetryableIds(
                        EnumSet.of(
                                OAuthUnlinkTask.Status.PENDING,
                                OAuthUnlinkTask.Status.FAILED,
                                OAuthUnlinkTask.Status.PROCESSING),
                        now,
                        PageRequest.of(0, BATCH_SIZE))
                .forEach(id -> taskProcessor.process(id, now));
    }
}
