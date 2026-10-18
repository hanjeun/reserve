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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;

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
        when(unlinkService.unlinkWithResult(AuthProvider.NAVER, "plain-token", 21L))
                .thenReturn(OAuthUnlinkService.Result.completed());

        processor.process(3L, now);

        verify(unlinkService).unlinkWithResult(AuthProvider.NAVER, "plain-token", 21L);
        verify(taskStateService).markCompleted(3L, "lease-1", now);
    }

    @Test
    void remoteFailureIsRetriedLater() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 11, 10, 0);
        OAuthUnlinkTaskStateService.Claim claim = new OAuthUnlinkTaskStateService.Claim(
                4L, 22L, AuthProvider.GOOGLE, "encrypted", "lease-2");
        when(taskStateService.claim(4L, now)).thenReturn(claim);
        when(tokenCipher.decrypt("encrypted")).thenReturn("plain-token");
        when(unlinkService.unlinkWithResult(AuthProvider.GOOGLE, "plain-token", 22L))
                .thenReturn(OAuthUnlinkService.Result.retryable("REMOTE_HTTP_503"));

        processor.process(4L, now);

        verify(taskStateService).markFailed(4L, "lease-2", now, "REMOTE_HTTP_503");
    }

    @Test
    void permanentCredentialFailureIsBlockedInsteadOfRetried() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 16, 1, 0);
        when(taskStateService.claim(5L, now)).thenReturn(new OAuthUnlinkTaskStateService.Claim(
                5L, 23L, AuthProvider.KAKAO, "encrypted", "lease-3"));
        when(tokenCipher.decrypt("encrypted")).thenReturn("plain-token");
        when(unlinkService.unlinkWithResult(AuthProvider.KAKAO, "plain-token", 23L))
                .thenReturn(OAuthUnlinkService.Result.blocked("REMOTE_HTTP_401"));

        processor.process(5L, now);

        verify(taskStateService).markBlocked(5L, "lease-3", now, "REMOTE_HTTP_401");
        verify(taskStateService, never()).markFailed(any(), any(), any(), any());
    }

    @Test
    void brokenEncryptionRequiresOperatorAttentionWithoutCallingTheProvider() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 16, 1, 0);
        when(taskStateService.claim(6L, now)).thenReturn(new OAuthUnlinkTaskStateService.Claim(
                6L, 24L, AuthProvider.GOOGLE, "encrypted", "lease-4"));
        when(tokenCipher.decrypt("encrypted")).thenThrow(new IllegalStateException("Key unavailable"));

        processor.process(6L, now);

        verify(taskStateService).markBlocked(6L, "lease-4", now, "TOKEN_DECRYPTION_ERROR");
        verifyNoInteractions(unlinkService);
    }
}
