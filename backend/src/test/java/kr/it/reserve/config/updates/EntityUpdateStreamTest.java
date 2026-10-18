package kr.it.reserve.config.updates;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.config.jwt.TokenProvider;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Optional;
import java.time.LocalDateTime;
import java.util.concurrent.RejectedExecutionException;

import static kr.it.reserve.config.updates.EntityUpdates.Domain.*;
import static kr.it.reserve.config.updates.EntityUpdates.Operation.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class EntityUpdateStreamTest {
    private final UpdateStreamAccess access = mock(UpdateStreamAccess.class);
    private final List<SseEmitter> emitted = new ArrayList<>();
    private final EntityUpdateStream stream = new EntityUpdateStream(access, () -> {
        SseEmitter emitter = mock(SseEmitter.class);
        emitted.add(emitter);
        return emitter;
    });

    @Test
    void everyConnectionStartsWithReconciliationMetadataAndUtcServerTime() throws Exception {
        stream.subscribePublic("127.0.0.1");
        var sent = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitted.getFirst()).send(sent.capture());
        var ready = sent.getValue().build().stream().map(item -> item.getData())
                .filter(java.util.Map.class::isInstance).map(java.util.Map.class::cast).findFirst().orElseThrow();
        assertThat(ready.get("epoch")).isInstanceOf(String.class);
        assertThat(ready.get("revision")).isEqualTo(0L);
        assertThat((EntityUpdates.Domain[]) ready.get("domains")).contains(FEED, NEWS, WAITING, RESERVATION);
        assertThatCode(() -> java.time.Instant.parse((String) ready.get("serverTime"))).doesNotThrowAnyException();
    }

    @Test
    void privateChangesReachOnlyTheirRecipientsAndNeverAnonymousOrOtherAccounts() throws Exception {
        when(access.current(any())).thenReturn(true);
        stream.subscribePublic("127.0.0.1");
        stream.subscribe(member(1, Role.USER));
        stream.subscribe(member(2, Role.USER));
        stream.subscribe(member(3, Role.ADMIN));
        emitted.forEach(org.mockito.Mockito::clearInvocations);

        stream.changed(change(NOTIFICATION, false, Set.of(1L), false));

        verify(emitted.get(1)).send(any(SseEmitter.SseEventBuilder.class));
        for (int index : new int[]{0, 2, 3}) verify(emitted.get(index), never()).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void authorizedReservationAdministratorsReceiveSignalsWithoutLeakingThemToOtherUsers() throws Exception {
        when(access.current(any())).thenReturn(true);
        stream.subscribe(member(1, Role.USER));
        stream.subscribe(member(2, Role.USER));
        stream.subscribe(member(3, Role.ADMIN));
        emitted.forEach(org.mockito.Mockito::clearInvocations);

        stream.changed(change(RESERVATION, false, Set.of(1L), true));

        verify(emitted.get(0)).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitted.get(1), never()).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitted.get(2)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void publicPayloadContainsOnlyMetadataAndAnOrderedEpochScopedId() throws Exception {
        stream.subscribePublic("127.0.0.1");
        SseEmitter emitter = emitted.getFirst();
        clearInvocations(emitter);
        stream.changed(change(FEED, true, Set.of(91L), false));
        stream.changed(change(COMMENT, true, Set.of(92L), false));

        var sent = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitter, times(2)).send(sent.capture());
        List<EntityUpdateStream.Signal> signals = sent.getAllValues().stream()
                .flatMap(event -> event.build().stream()).map(item -> item.getData())
                .filter(EntityUpdateStream.Signal.class::isInstance).map(EntityUpdateStream.Signal.class::cast).toList();
        assertThat(signals).hasSize(2);
        assertThat(signals.get(1).epoch()).isEqualTo(signals.getFirst().epoch());
        assertThat(signals.get(1).revision()).isEqualTo(signals.getFirst().revision() + 1);
        assertThat(signals.getFirst().eventId()).isEqualTo(signals.getFirst().epoch() + ":" + signals.getFirst().revision());
        var json = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(signals.getFirst()));
        assertThat(json.properties().stream().map(java.util.Map.Entry::getKey).toList())
                .containsExactlyInAnyOrder("eventId", "epoch", "revision", "domain", "entityId", "parentId", "storeId", "operation");
        assertThat(json.toString()).doesNotContain("\"memberId\"", "\"recipient\"", "\"content\"", "\"email\"", "\"token\"", "\"qr\"");
    }

    @Test
    void draftIdentifierNeverReachesPublicStreamAndPrivateDomainsRemainPrivateEvenWithABadFlag() throws Exception {
        when(access.current(any())).thenReturn(true);
        stream.subscribePublic("127.0.0.1");
        stream.subscribe(member(1, Role.USER));
        emitted.forEach(org.mockito.Mockito::clearInvocations);
        stream.changed(change(FEED, false, Set.of(1L), false));
        stream.changed(change(LIKE, true, Set.of(1L), false));
        verify(emitted.getFirst(), never()).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitted.get(1), times(2)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void confirmedAccountChangeEndsTheStreamBeforeAnyFurtherUpdate() throws Exception {
        when(access.current(any())).thenReturn(true);
        stream.subscribe(member(1, Role.USER));
        SseEmitter emitter = emitted.getFirst();
        clearInvocations(emitter);
        when(access.current(any())).thenReturn(false);
        stream.changed(change(FEED, true, Set.of(), false));
        stream.heartbeat();
        var sent = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitter).send(sent.capture());
        assertThat(sent.getValue().build().toString()).doesNotContain("Signal");
        assertThat(sent.getValue().build().stream().map(item -> item.getData()).toList().toString()).contains("session-ended");
        verify(emitter).complete();
    }

    @Test
    void transientDatabaseFailureDisconnectsWithoutClaimingThatTheSessionExpired() throws Exception {
        when(access.current(any())).thenReturn(true);
        stream.subscribe(member(1, Role.USER));
        SseEmitter emitter = emitted.getFirst();
        clearInvocations(emitter);
        when(access.current(any())).thenThrow(new IllegalStateException("temporary database failure"));
        stream.heartbeat();
        verify(emitter, never()).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitter).complete();
    }

    @Test
    void delayedOAuthRevocationDisconnectsOnlyTheOriginalFamilyBeforePrivateDelivery() throws Exception {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess liveAccess = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        Member member = member(1, Role.USER);
        member.setProvider(AuthProvider.GOOGLE);
        LocalDateTime oldAuthentication = LocalDateTime.of(2026, 10, 16, 8, 0);
        LocalDateTime cutoff = oldAuthentication.plusMinutes(1);
        LocalDateTime newAuthentication = cutoff.plusNanos(500_000_000);
        member.setOauthAuthenticatedAt(newAuthentication);
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        SseEmitter oldConnection = mock(SseEmitter.class);
        SseEmitter newConnection = mock(SseEmitter.class);
        SseEmitter publicConnection = mock(SseEmitter.class);
        var emitters = List.of(oldConnection, newConnection, publicConnection).iterator();
        EntityUpdateStream liveStream = new EntityUpdateStream(liveAccess, emitters::next);
        liveStream.subscribe(member, oldAuthentication);
        liveStream.subscribe(member, newAuthentication);
        liveStream.subscribePublic("127.0.0.1");
        clearInvocations(oldConnection, newConnection, publicConnection);

        member.recordOAuthSecurityRevocation(cutoff);
        liveStream.changed(change(NOTIFICATION, false, Set.of(1L), false));

        var oldSignal = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(oldConnection).send(oldSignal.capture());
        assertThat(oldSignal.getValue().build().stream().map(SseEmitter.DataWithMediaType::getData).toList().toString())
                .contains("session-ended").doesNotContain("Signal");
        verify(oldConnection).complete();
        verify(newConnection).send(any(SseEmitter.SseEventBuilder.class));
        verify(newConnection, never()).complete();
        verifyNoInteractions(publicConnection);
        clearInvocations(oldConnection, newConnection, publicConnection);
        liveStream.heartbeat();
        verifyNoInteractions(oldConnection);
        verify(newConnection).send(any(SseEmitter.SseEventBuilder.class));
        verify(publicConnection).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void pendingSignupCannotSubscribeAndPerAccountAndAddressLimitsAreBounded() {
        when(access.current(any())).thenReturn(true);
        Member pending = member(1, Role.USER);
        pending.setTermsAgreed(false);
        assertThatThrownBy(() -> stream.subscribe(pending)).isInstanceOf(MemberException.class);
        for (int index = 0; index < EntityUpdateStream.MAX_PER_SCOPE; index++) stream.subscribe(member(2, Role.USER));
        assertThatThrownBy(() -> stream.subscribe(member(2, Role.USER))).isInstanceOf(MemberException.class);
        for (int index = 0; index < EntityUpdateStream.MAX_PER_SCOPE; index++) stream.subscribePublic("127.0.0.1");
        assertThatThrownBy(() -> stream.subscribePublic("127.0.0.1")).isInstanceOf(MemberException.class);
    }

    @Test
    void slowDeliveryQueueSaturationClosesConnectionsSoReadyCanReconcileWithoutLoggingUsersOut() throws Exception {
        SseEmitter emitter = mock(SseEmitter.class);
        EntityUpdateStream bounded = new EntityUpdateStream(access, () -> emitter,
                ignored -> { throw new RejectedExecutionException("full"); });
        bounded.subscribePublic("127.0.0.1");
        clearInvocations(emitter);
        assertThatCode(() -> bounded.changed(change(FEED, true, Set.of(), false))).doesNotThrowAnyException();
        verify(emitter).complete();
        verify(emitter, never()).send(any(SseEmitter.SseEventBuilder.class));
    }

    private EntityUpdates.Change change(EntityUpdates.Domain domain, boolean visible, Set<Long> recipients, boolean admin) {
        return new EntityUpdates.Change(domain, 17L, 11L, 7L, UPDATED, null, visible, recipients, admin);
    }

    static Member member(long id, Role role) { return Member.builder().id(id).role(role).termsAgreed(true).build(); }
}
