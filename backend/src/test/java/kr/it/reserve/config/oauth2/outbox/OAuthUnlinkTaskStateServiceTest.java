package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OAuthUnlinkTaskStateServiceTest {

    @Mock
    private OAuthUnlinkTaskRepository taskRepository;

    private OAuthUnlinkTaskStateService stateService;

    @BeforeEach
    void setUp() {
        stateService = new OAuthUnlinkTaskStateService(taskRepository);
    }

    @Test
    void claimCreatesARecoverableLeaseWithoutCallingTheProvider() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTask task = OAuthUnlinkTask.pending(
                "a".repeat(64), 21L, AuthProvider.NAVER, "encrypted", now);
        when(taskRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(task));

        OAuthUnlinkTaskStateService.Claim claim = stateService.claim(3L, now);

        assertThat(claim).isNotNull();
        assertThat(task.getStatus()).isEqualTo(OAuthUnlinkTask.Status.PROCESSING);
        assertThat(task.getNextAttemptAt()).isAfter(now);
        assertThat(task.ownsLease(claim.leaseId())).isTrue();
    }

    @Test
    void completionDeletesTheCredentialOnlyForTheCurrentLease() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTask task = OAuthUnlinkTask.pending(
                "b".repeat(64), 22L, AuthProvider.GOOGLE, "encrypted", now);
        task.markProcessing(now.plusMinutes(1), "new-lease");
        when(taskRepository.findByIdForUpdate(4L)).thenReturn(Optional.of(task));

        stateService.markCompleted(4L, "stale-lease", now);
        assertThat(task.getStatus()).isEqualTo(OAuthUnlinkTask.Status.PROCESSING);

        stateService.markCompleted(4L, "new-lease", now);
        assertThat(task.getStatus()).isEqualTo(OAuthUnlinkTask.Status.COMPLETED);
        assertThat(task.getEncryptedAccessToken()).isNull();
        assertThat(task.getLeaseId()).isNull();
    }

    @Test
    void failedLeaseKeepsTheCredentialAndSchedulesBackoff() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTask task = OAuthUnlinkTask.pending(
                "c".repeat(64), 23L, AuthProvider.KAKAO, "encrypted", now);
        task.markProcessing(now.plusMinutes(1), "lease-3");
        when(taskRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(task));

        stateService.markFailed(5L, "lease-3", now, "REMOTE_REJECTED");

        assertThat(task.getStatus()).isEqualTo(OAuthUnlinkTask.Status.FAILED);
        assertThat(task.getAttemptCount()).isEqualTo(1);
        assertThat(task.getNextAttemptAt()).isAfter(now);
        assertThat(task.getEncryptedAccessToken()).isEqualTo("encrypted");
        assertThat(task.getLeaseId()).isNull();
    }
}
