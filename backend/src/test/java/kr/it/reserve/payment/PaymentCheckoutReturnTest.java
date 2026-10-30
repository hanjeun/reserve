package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PaymentCheckoutReturnResponse.Outcome;
import kr.it.reserve.payment.dto.PaymentStatusResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.*;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentCheckoutReturnTest {
    private final PaymentRepository rows = mock(PaymentRepository.class);
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final PortoneService pg = mock(PortoneService.class);
    private final PaymentReconciliationIssueService issues = mock(PaymentReconciliationIssueService.class);
    private final PaymentStatusService statuses = mock(PaymentStatusService.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final PaymentService payments = new PaymentService(rows, reservations, members, pg,
            mock(RefundLedgerService.class), mock(RefundAttemptRepository.class), issues,
            mock(PlatformTransactionManager.class), entityManager);
    private final PaymentCheckoutReturnService returns = new PaymentCheckoutReturnService(statuses, payments, pg);
    private final Member member = Member.builder().id(1L).build();
    private final Store store = Store.builder().id(3L).allowLatePayment(false).autoApprovalEnabled(false).build();
    private final Reservation reservation = Reservation.builder().id(2L).member(member).store(store)
            .status(Reservation.ReservationStatus.PENDING).depositAmount(10000).depositPaid(false).build();
    private final Payment payment = Payment.builder().id(4L).member(member).reservation(reservation)
            .merchantUid("ORDER-test").amount(10000).status(Payment.PaymentStatus.READY).build();

    @BeforeEach void setUp() {
        when(statuses.getStatus("reservation", "ORDER-test", 1L)).thenReturn(
                new PaymentStatusResponse("reservation", "ORDER-test", "READY", 10000, null, null, 0, null));
        when(rows.findReservationIdByMerchantUid("ORDER-test")).thenReturn(Optional.of(2L));
        when(reservations.findMemberIdById(2L)).thenReturn(Optional.of(1L));
        when(reservations.findByIdForPaymentUpdate(2L)).thenReturn(Optional.of(reservation));
        when(members.findByIdForPaymentUpdate(1L)).thenReturn(Optional.of(member));
        when(rows.findByMerchantUidForUpdate("ORDER-test")).thenReturn(Optional.of(payment));
        when(rows.findAllByReservationIdForUpdate(2L)).thenReturn(List.of(payment));
    }

    private PortoneV2PaymentResponse observation(String status) throws Exception {
        return new ObjectMapper().readValue("""
                {"id":"ORDER-test","storeId":"store-test","currency":"KRW","status":"%s",
                 "amount":{"total":10000},"pgTxId":"pg-test"}
                """.formatted(status), PortoneV2PaymentResponse.class);
    }

    @ParameterizedTest @ValueSource(strings = {"READY", "FAILED"})
    void unpaidAdvanceBookingGetsModalWithoutCancellingOrRefunding(String status) throws Exception {
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation(status));
        var result = returns.check("ORDER-test", 1L);
        assertThat(result.outcome()).isEqualTo(Outcome.INCOMPLETE);
        assertThat(result.storeId()).isEqualTo(3L);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        verify(pg).getPaymentInfo("ORDER-test"); verifyNoMoreInteractions(pg);
    }

    @Test void unauthorizedOrdersNeverReachPg() {
        when(statuses.getStatus("reservation", "ORDER-test", 9L)).thenThrow(PaymentException.notFound());
        assertThatThrownBy(() -> returns.check("ORDER-test", 9L)).isInstanceOf(PaymentException.class);
        verifyNoInteractions(pg);
    }

    @Test void ownershipIsCheckedAgainAfterPgLookup() throws Exception {
        var response = observation("READY");
        when(pg.getPaymentInfo("ORDER-test")).thenAnswer(ignored -> {
            payment.setMember(Member.builder().id(9L).build()); return response;
        });
        assertThatThrownBy(() -> returns.check("ORDER-test", 1L)).isInstanceOf(PaymentException.class);
    }

    @Test void latePaymentBookingsKeepTheirStatusPage() throws Exception {
        store.setAllowLatePayment(true);
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation("READY"));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
    }

    @Test void confirmedMissingPaymentAllowsOnlyUnpaidNotice() {
        when(pg.getPaymentInfo("ORDER-test")).thenThrow(PaymentException.notFound());
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.INCOMPLETE);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
    }

    @ParameterizedTest @ValueSource(strings = {"CANCELLED", "REJECTED", "COMPLETED", "NO_SHOW"})
    void closedReservationNeverGetsPaymentRetryNotice(String state) throws Exception {
        var response = observation("READY");
        when(pg.getPaymentInfo("ORDER-test")).thenAnswer(ignored -> {
            reservation.setStatus(Reservation.ReservationStatus.valueOf(state));
            return response;
        });
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.valueOf(state));
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
    }

    @Test void expiredReservationWaitsForExpiryInsteadOfOfferingPaymentRetry() throws Exception {
        store.setPaymentTimeoutMinutes(10);
        reservation.setCreatedAt(LocalDateTime.now().minusDays(1));
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation("FAILED"));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
    }

    @Test void removedReservationDoesNotClaimToRemainInMyReservations() {
        reservation.setDeletedAt(LocalDateTime.now());
        when(pg.getPaymentInfo("ORDER-test")).thenThrow(PaymentException.notFound());
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
        assertThat(reservation.isDeleted()).isTrue();
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
    }

    @Test void emptyBodyOrOutageDoesNotBecomeUnpaid() {
        when(pg.getPaymentInfo("ORDER-test")).thenThrow(new PaymentException("unavailable", HttpStatus.BAD_GATEWAY));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
    }

    @ParameterizedTest @ValueSource(strings = {"CANCELLED", "PARTIAL_CANCELLED", "PAY_PENDING", "VIRTUAL_ACCOUNT_ISSUED", "UNKNOWN"})
    void refundsAndUnrecognizedStatesNeverShowUnpaidModal(String status) throws Exception {
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation(status));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
    }

    @Test void paidResponseCompletesPaymentAndReservationTogether() throws Exception {
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation("PAID"));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        assertThat(reservation.getDepositPaid()).isTrue();
    }

    @Test void paymentCompletedByWebhookDuringLookupWinsOverOldReadyObservation() throws Exception {
        var response = observation("READY");
        when(pg.getPaymentInfo("ORDER-test")).thenAnswer(ignored -> {
            payment.setStatus(Payment.PaymentStatus.PAID); reservation.setDepositPaid(true); return response;
        });
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
    }

    @Test void latePaidClosedReservationIsReviewedAndNeverRevived() throws Exception {
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation("PAID"));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.REVIEW_REQUIRED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
    }

    @Test void mismatchedAmountAndOpenIssuesBlockIncompleteAdvice() throws Exception {
        payment.setAmount(5000);
        when(pg.getPaymentInfo("ORDER-test")).thenReturn(observation("READY"));
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
        payment.setAmount(10000); when(issues.hasOpenReservationIssues(2L)).thenReturn(true);
        assertThat(returns.check("ORDER-test", 1L).outcome()).isEqualTo(Outcome.STATUS);
    }
}
