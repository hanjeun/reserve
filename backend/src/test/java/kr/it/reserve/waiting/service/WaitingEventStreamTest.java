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
        UpdateStreamAccess access = new UpdateStreamAccess(members, activeDeviceTokens());
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
        stream.subscribe(member, oldAuthentication, "OAUTH", "old-device");
        stream.subscribe(member, newAuthentication, "OAUTH", "new-device");
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
    void aPasswordConnectionSurvivesTheOAuthCutoffButEndsWhenItsCredentialIsRemoved() throws Exception {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, activeDeviceTokens());
        Member member = member(1);
        member.setProvider(AuthProvider.NAVER);
        member.setPassword("enabled-password-hash");
        member.setTermsAgreed(false);
        member.recordOAuthSecurityRevocation(LocalDateTime.of(2026, 10, 16, 8, 0));
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        SseEmitter connection = mock(SseEmitter.class);
        WaitingEventStream stream = new WaitingEventStream(access, () -> connection);
        stream.subscribe(member, null, "PASSWORD", "password-device");
        clearInvocations(connection);

        stream.remoteChanged(new RedisWaitingRelay.RemoteChanged(11L, Set.of(1L)));
        verify(connection).send(any(SseEmitter.SseEventBuilder.class));
        verify(connection, never()).complete();
        clearInvocations(connection);

        member.setPassword(null);
        stream.heartbeat();
        var signal = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(connection).send(signal.capture());
        assertThat(signal.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString())
                .contains("session-ended").doesNotContain("heartbeat");
        verify(connection).complete();
    }

    @Test
    void sidlessLegacyContextCannotSubscribeEvenBeforeAProviderCutoff() {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, activeDeviceTokens());
        SseEmitter emitter = mock(SseEmitter.class);
        WaitingEventStream stream = new WaitingEventStream(access, () -> emitter);
        assertThatThrownBy(() -> stream.subscribe(member(1), null)).isInstanceOf(WaitingException.class);
        verifyNoInteractions(emitter);
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

    @Test
    void logoutOfOneDeviceEndsOnlyItsWaitingConnectionAtTheNextHeartbeat() throws Exception {
        Member member = member(1);
        member.setProvider(AuthProvider.LOCAL);
        member.setPassword("synthetic-hash");
        var fixture = new kr.it.reserve.config.JwtSessionFixture(member);
        var first = fixture.issue(null);
        var second = fixture.issue(null);
        var guarded = new UpdateStreamAccess(fixture.members, fixture.tokens);
        SseEmitter one = mock(SseEmitter.class), two = mock(SseEmitter.class);
        var emitters = List.of(one, two).iterator();
        var live = new WaitingEventStream(guarded, emitters::next);
        live.subscribe(member, null, "PASSWORD", fixture.tokens.getSessionId(first.accessToken()));
        live.subscribe(member, null, "PASSWORD", fixture.tokens.getSessionId(second.accessToken()));
        clearInvocations(one, two);
        fixture.service.revoke(first.refreshToken());
        live.heartbeat();
        var ended = org.mockito.ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(one).send(ended.capture());
        assertThat(ended.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString())
                .contains("session-ended").doesNotContain("heartbeat");
        verify(one).complete();
        verify(two).send(any(SseEmitter.SseEventBuilder.class));
        verify(two, never()).complete();
    }

    private static TokenProvider activeDeviceTokens() {
        TokenProvider tokens = mock(TokenProvider.class, CALLS_REAL_METHODS);
        doReturn(true).when(tokens).isDeviceSessionCurrent(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyLong());
        return tokens;
    }
}
