package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.config.oauth2.OAuthUnlinkService;
import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OAuthUnlinkTaskProcessorTest {

    @Mock private OAuthUnlinkTaskStateService taskStateService;
    @Mock private OAuthUnlinkTokenCipher tokenCipher;
    @Mock private OAuthUnlinkService unlinkService;
    @InjectMocks private OAuthUnlinkTaskProcessor processor;

    @Test
    void completesTheClaimAfterTheExternalCall() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTaskStateService.Claim claim = new OAuthUnlinkTaskStateService.Claim(
                3L, 21L, AuthProvider.NAVER, "encrypted", "lease-1");
        when(taskStateService.claim(3L, now)).thenReturn(claim);
        when(tokenCipher.decrypt("encrypted")).thenReturn("plain-token");
        when(unlinkService.unlink(AuthProvider.NAVER, "plain-token", 21L)).thenReturn(true);

        processor.process(3L, now);

        verify(unlinkService).unlink(AuthProvider.NAVER, "plain-token", 21L);
        verify(taskStateService).markCompleted(3L, "lease-1", now);
    }

    @Test
    void remoteFailureIsRetriedLater() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTaskStateService.Claim claim = new OAuthUnlinkTaskStateService.Claim(
                4L, 22L, AuthProvider.GOOGLE, "encrypted", "lease-2");
        when(taskStateService.claim(4L, now)).thenReturn(claim);
        when(tokenCipher.decrypt("encrypted")).thenReturn("plain-token");
        when(unlinkService.unlink(AuthProvider.GOOGLE, "plain-token", 22L)).thenReturn(false);

        processor.process(4L, now);

        verify(taskStateService).markFailed(4L, "lease-2", now, "REMOTE_REJECTED");
    }
}
