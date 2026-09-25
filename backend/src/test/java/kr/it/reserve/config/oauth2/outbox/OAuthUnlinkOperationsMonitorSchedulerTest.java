package kr.it.reserve.config.oauth2.outbox;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.EnumSet;

import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OAuthUnlinkOperationsMonitorSchedulerTest {

    @Mock
    private OAuthUnlinkTaskRepository taskRepository;

    @InjectMocks
    private OAuthUnlinkOperationsMonitorScheduler scheduler;

    @Test
    void countsAutomaticRetryFailuresAndManualBlocks() {
        scheduler.reportUnresolvedTasks();

        verify(taskRepository).countByStatusIn(EnumSet.of(
                OAuthUnlinkTask.Status.FAILED,
                OAuthUnlinkTask.Status.BLOCKED));
    }
}
