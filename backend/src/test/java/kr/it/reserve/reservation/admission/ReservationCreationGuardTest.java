package kr.it.reserve.reservation.admission;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReservationCreationGuardTest {
    private final ReservationRequestRepository requests = mock(ReservationRequestRepository.class);
    private final AdmissionService admission = mock(AdmissionService.class);
    private final ReservationCreationGuard guard = new ReservationCreationGuard(requests, admission);
    private ReservationCreateRequest request;

    @BeforeEach void start() {
        request = new ReservationCreateRequest(10L, LocalDate.of(2030, 1, 1), LocalTime.NOON, 1, null, false);
        request.setRequestId("11111111-1111-4111-8111-111111111111");
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
    @AfterEach void finish() { TransactionSynchronizationManager.clear(); }

    @Test void responseLossReturnsCommittedResultWithoutRedis() {
        var prior = new ReservationRequest(1L, request.getRequestId(), ReservationCreationGuard.fingerprint(request), 50L);
        when(requests.findByMemberIdAndRequestKey(1L, request.getRequestId())).thenReturn(Optional.of(prior));
        assertThat(guard.begin(request, 1L).replayReservationId()).isEqualTo(50L);
        verifyNoInteractions(admission);
    }
    @Test void differentPayloadCannotReuseCommittedKey() {
        var prior = new ReservationRequest(1L, request.getRequestId(), ReservationCreationGuard.fingerprint(request), 50L);
        request.setGuestCount(2);
        when(requests.findByMemberIdAndRequestKey(1L, request.getRequestId())).thenReturn(Optional.of(prior));
        assertThatThrownBy(() -> guard.begin(request, 1L)).isInstanceOf(ReservationException.class);
        verifyNoInteractions(admission);
    }
    @Test void rollbackReleasesClaimAndCommitConsumesIt() {
        var campaign = new AdmissionProperties.Campaign();
        var claim = new AdmissionService.Claim(campaign, 1L, "ticket", request.getRequestId());
        request.setAdmissionTicket("ticket");
        when(admission.match(10L, request.getReservationDate(), request.getReservationTime())).thenReturn(campaign);
        when(admission.claim(campaign, 1L, "ticket", request.getRequestId())).thenReturn(claim);
        guard.begin(request, 1L);
        var callback = TransactionSynchronizationManager.getSynchronizations().getFirst();
        callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        verify(admission).finish(claim, false);
        callback.afterCompletion(TransactionSynchronization.STATUS_COMMITTED);
        verify(admission).finish(claim, true);
    }
    @Test void missingAdmissionIsRejectedBeforeAnyRequestWrite() {
        var campaign = new AdmissionProperties.Campaign();
        when(admission.match(10L, request.getReservationDate(), request.getReservationTime())).thenReturn(campaign);
        when(admission.claim(campaign, 1L, null, request.getRequestId())).thenThrow(new ReservationException("입장권 필요"));
        assertThatThrownBy(() -> guard.begin(request, 1L)).isInstanceOf(ReservationException.class);
        verify(requests, never()).saveAndFlush(any());
    }
    @Test void redisCompletionFailureCannotReplaceCommittedDbSuccess() {
        var campaign = new AdmissionProperties.Campaign();
        var claim = new AdmissionService.Claim(campaign, 1L, null, request.getRequestId());
        when(admission.match(10L, request.getReservationDate(), request.getReservationTime())).thenReturn(campaign);
        when(admission.claim(campaign, 1L, null, request.getRequestId())).thenReturn(claim);
        doThrow(new IllegalStateException("offline")).when(admission).finish(claim, true);
        guard.begin(request, 1L);
        assertThatCode(() -> TransactionSynchronizationManager.getSynchronizations().getFirst().afterCompletion(TransactionSynchronization.STATUS_COMMITTED)).doesNotThrowAnyException();
    }
}
