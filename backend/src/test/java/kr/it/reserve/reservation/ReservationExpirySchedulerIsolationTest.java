package kr.it.reserve.reservation;

import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.scheduler.ReservationExpiryProcessor;
import kr.it.reserve.reservation.scheduler.ReservationExpiryScheduler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationExpirySchedulerIsolationTest {

    @Mock private ReservationRepository reservationRepository;
    @Mock private ReservationExpiryProcessor expiryProcessor;

    @InjectMocks
    private ReservationExpiryScheduler scheduler;

    @Test
    @DisplayName("한 후보의 실패가 다음 예약의 독립 트랜잭션 처리를 막지 않는다")
    void oneCandidateFailureDoesNotStopBatch() {
        when(reservationRepository.findMaximumReservationId()).thenReturn(2L);
        when(reservationRepository.findExpiredUnpaidReservationIds(any(), eq(0L), eq(2L), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(1L, 2L));
        when(expiryProcessor.expireIfDue(eq(1L), any()))
                .thenThrow(new IllegalStateException("temporary failure"));
        when(expiryProcessor.expireIfDue(eq(2L), any()))
                .thenReturn(ReservationExpiryProcessor.ExpiryResult.CANCELLED);

        scheduler.expireUnpaidReservations();

        verify(expiryProcessor).expireIfDue(eq(1L), any());
        verify(expiryProcessor).expireIfDue(eq(2L), any());
    }
}
