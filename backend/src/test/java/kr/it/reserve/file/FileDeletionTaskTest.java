package kr.it.reserve.file;

import kr.it.reserve.file.entity.FileDeletionTask;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class FileDeletionTaskTest {

    @Test
    @DisplayName("파일 삭제 실패는 backoff로 남고 성공하면 원본 경로를 지운다")
    void failureRetriesAndSuccessMinimizesTarget() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 1, 0, 0);
        FileDeletionTask task = FileDeletionTask.pending(
                "users/1/profile.png", "hash", "MEMBER_PROFILE_IMAGE", 1L, now);

        task.markFailed(now, "S3Exception");
        assertThat(task.getStatus()).isEqualTo(FileDeletionTask.Status.FAILED);
        assertThat(task.getAttemptCount()).isEqualTo(1);
        assertThat(task.getNextAttemptAt()).isAfter(now);
        assertThat(task.getTarget()).isNotNull();

        task.markCompleted(task.getNextAttemptAt());
        assertThat(task.getStatus()).isEqualTo(FileDeletionTask.Status.COMPLETED);
        assertThat(task.getTarget()).isNull();
        assertThat(task.getLastErrorType()).isNull();
    }
}
