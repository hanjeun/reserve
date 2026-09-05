package kr.it.reserve.file.service;

import kr.it.reserve.file.entity.FileDeletionTask;
import kr.it.reserve.file.repository.FileDeletionTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** 항목 하나를 독립 트랜잭션으로 처리해 한 파일 실패가 다른 파일의 삭제를 막지 않게 한다. */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileDeletionTaskProcessor {

    private final FileDeletionTaskRepository taskRepository;
    private final FileStorageService fileStorageService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(Long taskId, LocalDateTime now) {
        FileDeletionTask task = taskRepository.findByIdForUpdate(taskId).orElse(null);
        if (task == null || !task.canAttempt(now)) return;

        try {
            fileStorageService.deleteFileRequired(task.getTarget());
            task.markCompleted(now);
            log.info("Queued file deletion completed: taskId={}", taskId);
        } catch (Exception e) {
            task.markFailed(now, e.getClass().getSimpleName());
            log.warn("Queued file deletion failed: taskId={}, errorType={}",
                    taskId, e.getClass().getSimpleName());
        }
    }
}
