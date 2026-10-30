package kr.it.reserve.reservation;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.StaleReadyReconciliationResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationRemovalService;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class ReservationRemovalServiceTest {
    @Mock ReservationRepository reservations;
    @Mock PaymentRepository payments;
    @Mock PaymentService paymentService;
    @Mock ReservationService reservationService;
    @Mock PlatformTransactionManager transactions;
    @InjectMocks ReservationRemovalService service;
    private final Member member = Member.builder().id(1L).build();
    private final Member owner = Member.builder().id(2L).build();
    private Reservation reservation;

    @BeforeEach void setup() {
        reservation = Reservation.builder().id(3L).member(member).store(Store.builder().owner(owner).build())
                .status(Reservation.ReservationStatus.CANCELLED).build();
        when(reservations.findById(3L)).thenReturn(Optional.of(reservation));
        when(transactions.getTransaction(any())).thenAnswer(invocation -> {
            assertThat(((TransactionDefinition) invocation.getArgument(0)).isReadOnly()).isTrue();
            return new SimpleTransactionStatus();
        });
    }

    @ParameterizedTest @ValueSource(longs = {1, 2})
    void participantsRecheckOutsideSnapshotThenUseTheFinalFinancialGate(long actorId) {
        var actor = Member.builder().id(actorId).build();
        when(payments.findReadyByReservationId(3L)).thenReturn(List.of(Payment.builder().id(4L).build()));
        when(paymentService.reconcileStaleReadyPayment(4L)).thenReturn(outcome(StaleReadyReconciliationResponse.Outcome.CLOSED_AS_NOT_PAID));
        service.remove(3L, actor);
        var order = inOrder(transactions, paymentService, reservationService);
        order.verify(transactions).commit(any());
        order.verify(paymentService).reconcileStaleReadyPayment(4L);
        order.verify(reservationService).removeReservation(3L, actor);
    }

    @Test void aDifferentAccountCannotTriggerPgReads() {
        assertThatThrownBy(() -> service.remove(3L, Member.builder().id(9L).build())).isInstanceOf(ReservationException.class);
        verifyNoInteractions(payments, paymentService, reservationService);
    }

    @ParameterizedTest @EnumSource(value = Reservation.ReservationStatus.class, names = {"PENDING", "CONFIRMED", "UNCONFIRMED"})
    void activeReservationsDoNotTriggerPgReadsOrRemoval(Reservation.ReservationStatus status) {
        reservation.setStatus(status);
        assertThatThrownBy(() -> service.remove(3L, member)).isInstanceOf(ReservationException.class);
        verifyNoInteractions(payments, paymentService, reservationService);
    }

    @ParameterizedTest @EnumSource(value = StaleReadyReconciliationResponse.Outcome.class,
            names = {"PAID_RECOVERED", "STILL_PENDING", "MANUAL_REVIEW_REQUIRED", "RETRY_REQUIRED"})
    void uncertainOrPaidResultsCannotReachRemoval(StaleReadyReconciliationResponse.Outcome value) {
        when(payments.findReadyByReservationId(3L)).thenReturn(List.of(Payment.builder().id(4L).build()));
        when(paymentService.reconcileStaleReadyPayment(4L)).thenReturn(outcome(value));
        assertThatThrownBy(() -> service.remove(3L, member)).isInstanceOf(ReservationException.class).hasMessageContaining("결제·환불 확인");
        verifyNoInteractions(reservationService);
    }

    @Test void noReadyPaymentStillRequiresTheFinalFinancialGate() {
        when(payments.findReadyByReservationId(3L)).thenReturn(List.of());
        doThrow(new ReservationException("결제·환불 확인이 끝난 후 예약을 삭제할 수 있어요."))
                .when(reservationService).removeReservation(3L, member);
        assertThatThrownBy(() -> service.remove(3L, member)).isInstanceOf(ReservationException.class);
        verifyNoInteractions(paymentService);
    }

    private StaleReadyReconciliationResponse outcome(StaleReadyReconciliationResponse.Outcome value) {
        return new StaleReadyReconciliationResponse(4L, "synthetic-order", "READY", null, value);
    }
}
