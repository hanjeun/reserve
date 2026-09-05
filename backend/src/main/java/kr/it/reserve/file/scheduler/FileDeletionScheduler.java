package kr.it.reserve.file.scheduler;

import kr.it.reserve.file.entity.FileDeletionTask;
import kr.it.reserve.file.repository.FileDeletionTaskRepository;
import kr.it.reserve.file.service.FileDeletionTaskProcessor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.EnumSet;

@Component
@RequiredArgsConstructor
public class FileDeletionScheduler {

    private static final int BATCH_SIZE = 50;

    private final FileDeletionTaskRepository taskRepository;
    private final FileDeletionTaskProcessor taskProcessor;

    @Scheduled(fixedDelayString = "${file.deletion.fixed-delay-ms:60000}")
    public void deleteQueuedFiles() {
        LocalDateTime now = LocalDateTime.now();
        taskRepository.findRetryableIds(
                        EnumSet.of(FileDeletionTask.Status.PENDING, FileDeletionTask.Status.FAILED),
                        now,
                        PageRequest.of(0, BATCH_SIZE))
                .forEach(id -> taskProcessor.process(id, now));
    }
}
