package kr.it.reserve.waiting.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.updates.UpdateStreamAccess;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.waiting.error.WaitingException;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WaitingEventStreamTest {
    @Test
    void failedHeartbeatDropsOnlyTheClosedStreamWithoutCompletingItsFailedResponseAgain() throws Exception {
        UpdateStreamAccess access = mock(UpdateStreamAccess.class);
        when(access.current(any())).thenReturn(true);
        SseEmitter disconnected = mock(SseEmitter.class);
        SseEmitter healthy = mock(SseEmitter.class);
        var emitters = List.of(disconnected, healthy).iterator();
        WaitingEventStream stream = new WaitingEventStream(access, emitters::next);
        stream.subscribe(member(1), null);
        stream.subscribe(member(2), null);
        clearInvocations(disconnected, healthy);
        doThrow(new IOException("closed connection")).when(disconnected).send(any(SseEmitter.SseEventBuilder.class));

        stream.heartbeat();
        stream.heartbeat();

        verify(disconnected).send(any(SseEmitter.SseEventBuilder.class));
        verify(disconnected, never()).complete();
        verify(disconnected, never()).completeWithError(any());
        verify(healthy, times(2)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void delayedCutoffEndsTheOldConnectionBeforeDeliveryWhilePreservingTheNewConnection() throws Exception {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        Member member = member(1);
        member.setProvider(AuthProvider.NAVER);
        member.setTermsAgreed(false); // 이 스트림은 기존부터 약관 동의를 가입 조건으로 추가하지 않았다.
        LocalDateTime oldAuthentication = LocalDateTime.of(2026, 10, 16, 8, 0);
        LocalDateTime cutoff = oldAuthentication.plusMinutes(1);
        LocalDateTime newAuthentication = cutoff.plusNanos(500_000_000);
        member.setOauthAuthenticatedAt(newAuthentication);
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        SseEmitter oldConnection = mock(SseEmitter.class);
        SseEmitter newConnection = mock(SseEmitter.class);
        var emitters = List.of(oldConnection, newConnection).iterator();
        WaitingEventStream stream = new WaitingEventStream(access, emitters::next);
        stream.subscribe(member, oldAuthentication);
        stream.subscribe(member, newAuthentication);
        clearInvocations(oldConnection, newConnection);

        member.recordOAuthSecurityRevocation(cutoff);
        stream.remoteChanged(new RedisWaitingRelay.RemoteChanged(11L, Set.of(1L)));

        var oldSignal = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(oldConnection).send(oldSignal.capture());
        assertThat(oldSignal.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString())
                .contains("session-ended").doesNotContain("storeId");
        verify(oldConnection).complete();
        verify(newConnection).send(any(SseEmitter.SseEventBuilder.class));
        verify(newConnection, never()).complete();
        clearInvocations(oldConnection, newConnection);
        stream.heartbeat();
        verifyNoInteractions(oldConnection);
        verify(newConnection).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void heartbeatClosesARevokedLegacyContextAndSubscribeRejectsItAfterTheCutoff() throws Exception {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        Member member = member(1);
        member.setProvider(AuthProvider.NAVER);
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        SseEmitter emitter = mock(SseEmitter.class);
        WaitingEventStream stream = new WaitingEventStream(access, () -> emitter);
        stream.subscribe(member, null);
        clearInvocations(emitter);

        member.recordOAuthSecurityRevocation(LocalDateTime.of(2026, 10, 16, 8, 0));
        stream.heartbeat();

        var signal = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitter).send(signal.capture());
        assertThat(signal.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString())
                .contains("session-ended").doesNotContain("heartbeat");
        verify(emitter).complete();
        assertThatThrownBy(() -> stream.subscribe(member, null)).isInstanceOf(WaitingException.class);
    }

    @Test
    void databaseFailureClosesTheStreamWithoutReportingAConfirmedRevocation() throws Exception {
        UpdateStreamAccess access = mock(UpdateStreamAccess.class);
        when(access.current(any())).thenReturn(true);
        SseEmitter emitter = mock(SseEmitter.class);
        WaitingEventStream stream = new WaitingEventStream(access, () -> emitter);
        stream.subscribe(member(1), null);
        clearInvocations(emitter);
        when(access.current(any())).thenThrow(new IllegalStateException("database unavailable"));

        stream.heartbeat();

        verify(emitter, never()).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitter).complete();
    }

    @Test
    void aValidConnectionStillReceivesOnlyItsOwnWaitingChange() throws Exception {
        UpdateStreamAccess access = mock(UpdateStreamAccess.class);
        when(access.current(any())).thenReturn(true);
        SseEmitter recipient = mock(SseEmitter.class);
        SseEmitter outsider = mock(SseEmitter.class);
        var emitters = List.of(recipient, outsider).iterator();
        WaitingEventStream stream = new WaitingEventStream(access, emitters::next);
        stream.subscribe(member(1), null);
        stream.subscribe(member(2), null);
        clearInvocations(recipient, outsider);

        stream.remoteChanged(new RedisWaitingRelay.RemoteChanged(11L, Set.of(1L)));

        verify(recipient).send(any(SseEmitter.SseEventBuilder.class));
        verifyNoInteractions(outsider);
    }

    private Member member(long id) {
        return Member.builder().id(id).role(Role.USER).termsAgreed(true).build();
    }
}
