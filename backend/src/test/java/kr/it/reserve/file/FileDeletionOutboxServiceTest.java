package kr.it.reserve.file;

import kr.it.reserve.file.entity.FileDeletionTask;
import kr.it.reserve.file.repository.FileDeletionTaskRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class FileDeletionOutboxServiceTest {
    private static final String TARGET = "users/7/chat/example.bin";
    private static final String TARGET_HASH = "8963c14c47d1283264caa11531adeb9dea91615bca62d0f3e18a0202467f8c33";
    private final FileDeletionTaskRepository tasks = mock(FileDeletionTaskRepository.class);
    private final FileDeletionOutboxService service = new FileDeletionOutboxService(tasks);

    @Test
    void deletionIntentIsImmediatelyRetryableAndDeduplicatedByTarget() {
        when(tasks.findByTargetHash(TARGET_HASH)).thenReturn(Optional.empty());
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.enqueue(TARGET, "CHAT_MESSAGE", 20L);

        ArgumentCaptor<FileDeletionTask> saved = ArgumentCaptor.forClass(FileDeletionTask.class);
        verify(tasks).save(saved.capture());
        FileDeletionTask task = saved.getValue();
        assertThat(task.getTarget()).isEqualTo(TARGET);
        assertThat(task.getTargetHash()).isEqualTo(TARGET_HASH);
        assertThat(task.getSourceType()).isEqualTo("CHAT_MESSAGE");
        assertThat(task.getSourceId()).isEqualTo(20L);
        assertThat(task.getStatus()).isEqualTo(FileDeletionTask.Status.PENDING);
        assertThat(task.getAttemptCount()).isZero();
        assertThat(task.getNextAttemptAt()).isBetween(started, LocalDateTime.now(Clock.systemDefaultZone()));
        assertThat(task.canAttempt(LocalDateTime.now(Clock.systemDefaultZone()))).isTrue();
        when(tasks.findByTargetHash(TARGET_HASH)).thenReturn(Optional.of(task));

        service.enqueue(TARGET, "CHAT_MESSAGE", 21L);

        verify(tasks, times(2)).findByTargetHash(TARGET_HASH);
        verifyNoMoreInteractions(tasks);
    }

    @Test
    void absentTargetCannotCreateADeletionTask() {
        service.enqueue(null, "CHAT_MESSAGE", 20L);
        service.enqueue(" ", "CHAT_MESSAGE", 20L);

        verifyNoInteractions(tasks);
    }
}
