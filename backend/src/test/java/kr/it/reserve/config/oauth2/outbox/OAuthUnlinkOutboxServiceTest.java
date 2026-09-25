package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OAuthUnlinkOutboxServiceTest {

    @Mock private OAuthUnlinkTaskRepository taskRepository;
    @Mock private OAuthUnlinkTokenCipher tokenCipher;
    @InjectMocks private OAuthUnlinkOutboxService outboxService;

    @Test
    void storesAnEncryptedDurableTask() {
        when(taskRepository.findByTaskKey(any())).thenReturn(Optional.empty());
        when(tokenCipher.encrypt("plain-token")).thenReturn("encrypted-token");

        outboxService.enqueue(17L, AuthProvider.KAKAO, "plain-token");

        ArgumentCaptor<OAuthUnlinkTask> captor = ArgumentCaptor.forClass(OAuthUnlinkTask.class);
        verify(taskRepository).save(captor.capture());
        OAuthUnlinkTask task = captor.getValue();
        assertThat(task.getTaskKey()).hasSize(64);
        assertThat(task.getEncryptedAccessToken()).isEqualTo("encrypted-token");
        assertThat(task.getStatus()).isEqualTo(OAuthUnlinkTask.Status.PENDING);
    }

    @Test
    void recordsMissingCredentialsAsBlockedInsteadOfLosingTheIntent() {
        when(taskRepository.findByTaskKey(any())).thenReturn(Optional.empty());
        when(tokenCipher.encrypt(null)).thenReturn(null);

        outboxService.enqueue(18L, AuthProvider.GOOGLE, null);

        ArgumentCaptor<OAuthUnlinkTask> captor = ArgumentCaptor.forClass(OAuthUnlinkTask.class);
        verify(taskRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(OAuthUnlinkTask.Status.BLOCKED);
        assertThat(captor.getValue().getLastErrorType()).isEqualTo("TOKEN_MISSING");
    }

    @Test
    void doesNotCreateAnExternalTaskForLocalMembers() {
        outboxService.enqueue(19L, AuthProvider.LOCAL, "unused");

        verify(taskRepository, never()).save(any());
    }
}
