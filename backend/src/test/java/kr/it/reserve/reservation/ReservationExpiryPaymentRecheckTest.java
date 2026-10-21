package kr.it.reserve.reservation;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.scheduler.ReservationExpiryProcessor;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

@ExtendWith(MockitoExtension.class)
class ReservationExpiryPaymentRecheckTest {

    @Mock private ReservationRepository reservationRepository;
    @Mock private PaymentService paymentService;

    @Mock private PlatformTransactionManager transactionManager;

    @BeforeEach
    void transactionBoundaries() {
        lenient().when(transactionManager.getTransaction(any()))
                .thenAnswer(ignored -> new SimpleTransactionStatus());
    }

    @InjectMocks
    private ReservationExpiryProcessor expiryProcessor;

    @Test
    @DisplayName("만료 직전 PAID가 복구되면 예약을 보존한다")
    void recoveredPaymentPreservesReservation() {
        Reservation reservation = expiredReservation(1L);
        when(reservationRepository.findById(1L)).thenReturn(Optional.of(reservation));
        when(reservationRepository.existsById(1L)).thenReturn(true);
        when(paymentService.lockReservationPayments(1L)).thenReturn(reservation);
        when(paymentService.applyLockedExpiryPaymentObservation(reservation, null))
                .thenReturn(PaymentService.ExpiryPaymentDecision.PAID_RECOVERED);

        ReservationExpiryProcessor.ExpiryResult result =
                expiryProcessor.expireIfDue(1L, LocalDateTime.now());

        assertThat(result).isEqualTo(ReservationExpiryProcessor.ExpiryResult.PAYMENT_RECOVERED);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
    }

    @Test
    @DisplayName("PG 상태가 불확실하면 fail-closed로 예약을 보존한다")
    void uncertainPaymentDefersCancellation() {
        Reservation reservation = expiredReservation(2L);
        when(reservationRepository.findById(2L)).thenReturn(Optional.of(reservation));
        when(reservationRepository.existsById(2L)).thenReturn(true);
        when(paymentService.lockReservationPayments(2L)).thenReturn(reservation);
        when(paymentService.applyLockedExpiryPaymentObservation(reservation, null))
                .thenReturn(PaymentService.ExpiryPaymentDecision.UNCERTAIN);

        ReservationExpiryProcessor.ExpiryResult result =
                expiryProcessor.expireIfDue(2L, LocalDateTime.now());

        assertThat(result).isEqualTo(ReservationExpiryProcessor.ExpiryResult.DEFERRED);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
    }

    @Test
    @DisplayName("PG까지 미결제임이 확인된 예약만 취소한다")
    void confirmedUnpaidReservationIsCancelled() {
        Reservation reservation = expiredReservation(3L);
        when(reservationRepository.findById(3L)).thenReturn(Optional.of(reservation));
        when(reservationRepository.existsById(3L)).thenReturn(true);
        when(paymentService.lockReservationPayments(3L)).thenReturn(reservation);
        when(paymentService.applyLockedExpiryPaymentObservation(reservation, null))
                .thenReturn(PaymentService.ExpiryPaymentDecision.NOT_PAID);

        ReservationExpiryProcessor.ExpiryResult result =
                expiryProcessor.expireIfDue(3L, LocalDateTime.now());

        assertThat(result).isEqualTo(ReservationExpiryProcessor.ExpiryResult.CANCELLED);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
    }

    @Test
    @DisplayName("결제 재확인 중 예약이 승인됐다면 잠금 후 최신 상태를 보고 취소하지 않는다")
    void concurrentApprovalIsNotOverwrittenByExpiry() {
        Reservation reservation = expiredReservation(4L);
        Reservation locked = expiredReservation(4L);
        locked.setStatus(Reservation.ReservationStatus.CONFIRMED);
        when(reservationRepository.findById(4L)).thenReturn(Optional.of(reservation));
        when(reservationRepository.existsById(4L)).thenReturn(true);
        when(paymentService.lockReservationPayments(4L)).thenReturn(locked);

        ReservationExpiryProcessor.ExpiryResult result =
                expiryProcessor.expireIfDue(4L, LocalDateTime.now());

        assertThat(result).isEqualTo(ReservationExpiryProcessor.ExpiryResult.SKIPPED);
        assertThat(locked.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        verify(paymentService, never()).applyLockedExpiryPaymentObservation(any(), any());
    }

    private Reservation expiredReservation(Long id) {
        Store store = Store.builder()
                .id(id + 100L)
                .paymentTimeoutMinutes(1)
                .allowLatePayment(false)
                .build();
        Member member = Member.builder()
                .id(id + 200L)
                .name("test")
                .email("test-" + id + "@example.com")
                .build();
        return Reservation.builder()
                .id(id)
                .store(store)
                .member(member)
                .status(Reservation.ReservationStatus.PENDING)
                .depositAmount(10_000)
                .depositPaid(false)
                .createdAt(LocalDateTime.now().minusMinutes(10))
                .build();
    }
}
