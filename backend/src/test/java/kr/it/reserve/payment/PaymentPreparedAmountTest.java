package kr.it.reserve.payment;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PaymentRequestDto;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.*;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentPreparedAmountTest {
    @Mock private EntityManager entityManager;
    @Mock PaymentRepository payments;
    @Mock ReservationRepository reservations;
    @Mock MemberRepository members;
    @Mock PortoneService portone;
    @Mock RefundLedgerService ledger;
    @Mock RefundAttemptRepository attempts;
    @Mock PaymentReconciliationIssueService issues;
    @InjectMocks PaymentService service;

    @Test
    void aFreeReservationDoesNotBecomePayableAfterTheStoreRaisesItsDeposit() {
        stubReservation(0);
        assertThatThrownBy(() -> service.preparePayment(request(), 7L))
                .isInstanceOf(PaymentException.class).hasMessage("결제할 예약금이 없는 예약이에요.");
        verify(payments, never()).save(any());
        verifyNoInteractions(portone);
    }

    @Test
    void aPaidReservationKeepsItsOriginalAmountEvenWhenTheStoreOrClientRequestsMore() {
        stubReservation(3000);
        when(payments.findAllByReservationIdForUpdate(31L)).thenReturn(List.of());
        var prepared = service.preparePayment(request(), 7L);
        assertThat(prepared.getAmount()).isEqualTo(3000);
        assertThat(prepared.getMerchantUid()).matches("[A-Za-z0-9]{1,40}");
    }

    @Test
    void anExistingReadyOrderKeepsItsIdentityForLookupAndRefund() {
        var reservation = stubReservation(3000);
        var existing = kr.it.reserve.payment.entity.Payment.builder().id(51L).reservation(reservation)
                .member(reservation.getMember()).merchantUid("ORD-legacy-identity").amount(3000)
                .status(kr.it.reserve.payment.entity.Payment.PaymentStatus.READY).build();
        when(payments.findAllByReservationIdForUpdate(31L)).thenReturn(List.of(existing));
        assertThat(service.preparePayment(request(), 7L).getMerchantUid()).isEqualTo("ORD-legacy-identity");
        verify(payments, never()).save(any());
        verify(portone, never()).getPaymentInfo(anyString());
    }

    @Test
    void onlyAnAbsentLegacyAmountFallsBackToTheStoreSetting() {
        stubReservation(null);
        when(payments.findAllByReservationIdForUpdate(31L)).thenReturn(List.of());
        assertThat(service.preparePayment(request(), 7L).getAmount()).isEqualTo(9000);
    }

    @Test
    void expiredPaymentCannotOpenOrReuseAPgOrder() {
        var reservation = stubReservation(3000);
        reservation.setCreatedAt(java.time.LocalDateTime.now().minusHours(1));
        reservation.getStore().setPaymentTimeoutMinutes(10);
        assertThatThrownBy(() -> service.preparePayment(request(), 7L))
                .isInstanceOf(PaymentException.class).hasMessageContaining("결제 기한");
        verify(payments, never()).save(any());
        verifyNoInteractions(portone);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
    }

    private Reservation stubReservation(Integer amount) {
        Member member = Member.builder().id(7L).name("금액 검증").build();
        Reservation reservation = Reservation.builder().id(31L).member(member)
                .store(Store.builder().noShowDeposit(9000).build()).depositAmount(amount)
                .status(Reservation.ReservationStatus.PENDING).depositPaid(false).build();
        when(reservations.findMemberIdById(31L)).thenReturn(Optional.of(7L));
        when(reservations.findByIdForPaymentUpdate(31L)).thenReturn(Optional.of(reservation));
        when(members.findByIdForPaymentUpdate(7L)).thenReturn(Optional.of(member));
        return reservation;
    }

    private PaymentRequestDto request() {
        return PaymentRequestDto.builder().reservationId(31L).amount(100000).build();
    }
}
