package kr.it.reserve.reservation;

import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.scheduler.ReservationElapsedProcessor;
import kr.it.reserve.reservation.scheduler.ReservationElapsedScheduler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationElapsedSchedulerIsolationTest {
    @Mock ReservationRepository reservations;
    @Mock ReservationElapsedProcessor processor;
    @InjectMocks ReservationElapsedScheduler scheduler;

    @Test
    void oneConflictingRefundDoesNotPreventTheNextReservationFromBeingProcessed() {
        when(reservations.findMaximumReservationId()).thenReturn(2L);
        when(reservations.findElapsedActiveReservationIds(any(), any(), eq(0L), eq(2L), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(1L, 2L));
        when(processor.processOne(eq(1L), any())).thenThrow(new PaymentException("Synthetic unresolved refund"));
        when(processor.processOne(eq(2L), any())).thenReturn(ReservationElapsedProcessor.Result.CANCELLED);

        scheduler.processElapsedReservations();

        var order = inOrder(processor);
        order.verify(processor).processOne(eq(1L), any());
        order.verify(processor).processOne(eq(2L), any());
    }
}
