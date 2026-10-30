package kr.it.reserve.payment;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.*;
import kr.it.reserve.payment.service.*;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationRemovalPaymentGuardTest {
    @Mock PaymentRepository repository;
    @Mock ReservationRepository reservations;
    @Mock MemberRepository members;
    @Mock PortoneService portone;
    @Mock RefundLedgerService ledger;
    @Mock RefundAttemptRepository refunds;
    @Mock PaymentReconciliationIssueService issues;
    @Mock PlatformTransactionManager transactions;
    @Mock EntityManager entities;
    @InjectMocks PaymentService service;

    private Reservation reservation() {
        return Reservation.builder().id(1L).status(Reservation.ReservationStatus.REJECTED).build();
    }
    private Payment payment(Payment.PaymentStatus status) {
        return Payment.builder().id(2L).amount(1000).refundAmount(status == Payment.PaymentStatus.REFUNDED ? 1000 : 0).status(status).build();
    }
    @ParameterizedTest
    @EnumSource(value=Payment.PaymentStatus.class, names={"READY","REFUND_PENDING","PAID","PARTIAL_REFUNDED"})
    void unresolvedOrRefundDuePaymentsBlockRemovalWithoutCallingPg(Payment.PaymentStatus status) {
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(status)));
        assertThatThrownBy(() -> service.requireReservationRemovable(reservation())).isInstanceOf(ReservationException.class);
        verifyNoInteractions(portone, ledger);
    }
    @Test void openReconciliationAndUnresolvedAttemptsBlockEvenARefundedPayment() {
        when(issues.hasOpenReservationIssues(1L)).thenReturn(true);
        assertThat(service.isReservationRemovalSafe(reservation())).isFalse();
        verifyNoInteractions(repository);
        when(issues.hasOpenReservationIssues(1L)).thenReturn(false);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(Payment.PaymentStatus.REFUNDED)));
        when(refunds.existsByPaymentIdAndStatusIn(2L, RefundAttempt.UNRESOLVED)).thenReturn(true);
        assertThat(service.isReservationRemovalSafe(reservation())).isFalse();
        verifyNoInteractions(portone, ledger);
    }
    @Test void fullyRefundedAndFinalNoShowRemainRemovable() {
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(Payment.PaymentStatus.REFUNDED)));
        service.requireReservationRemovable(reservation());
        var noShow = reservation(); noShow.setStatus(Reservation.ReservationStatus.NO_SHOW);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(Payment.PaymentStatus.PAID)));
        service.requireReservationRemovable(noShow);
        verifyNoInteractions(portone, ledger);
    }
    @Test void malformedFinancialTotalsFailClosed() {
        var payment = payment(Payment.PaymentStatus.REFUNDED); payment.setRefundAmount(2000);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment));
        assertThat(service.isReservationRemovalSafe(reservation())).isFalse();
    }
    @Test void settledCustomerCancellationPreservesPartialAndNonRefundablePolicies() {
        var cancelled = reservation(); cancelled.setStatus(Reservation.ReservationStatus.CANCELLED);
        var partial = payment(Payment.PaymentStatus.PARTIAL_REFUNDED); partial.setRefundAmount(500);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(partial));
        service.requireReservationRemovable(cancelled);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(Payment.PaymentStatus.PAID)));
        service.requireReservationRemovable(cancelled);
        cancelled.setCancelReason("가게 사정");
        assertThat(service.isReservationRemovalSafe(cancelled)).isFalse();
    }
    @Test void failedRefundIntentCannotBeHiddenByACustomerCancellation() {
        var cancelled = reservation(); cancelled.setStatus(Reservation.ReservationStatus.CANCELLED);
        when(repository.findAllByReservationIdForUpdate(1L)).thenReturn(List.of(payment(Payment.PaymentStatus.PAID)));
        var failed = mock(RefundAttempt.class);
        when(failed.getStatus()).thenReturn(RefundAttempt.Status.FAILED);
        when(failed.getRequestedAmount()).thenReturn(500);
        when(refunds.findByPaymentIdForUpdate(2L)).thenReturn(List.of(failed));
        assertThat(service.isReservationRemovalSafe(cancelled)).isFalse(); verifyNoInteractions(portone);
    }
}
