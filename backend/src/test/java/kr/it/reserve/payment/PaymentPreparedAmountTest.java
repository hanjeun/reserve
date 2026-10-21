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
        assertThat(service.preparePayment(request(), 7L).getAmount()).isEqualTo(3000);
    }

    @Test
    void onlyAnAbsentLegacyAmountFallsBackToTheStoreSetting() {
        stubReservation(null);
        when(payments.findAllByReservationIdForUpdate(31L)).thenReturn(List.of());
        assertThat(service.preparePayment(request(), 7L).getAmount()).isEqualTo(9000);
    }

    private void stubReservation(Integer amount) {
        Member member = Member.builder().id(7L).name("금액 검증").build();
        Reservation reservation = Reservation.builder().id(31L).member(member)
                .store(Store.builder().noShowDeposit(9000).build()).depositAmount(amount)
                .status(Reservation.ReservationStatus.PENDING).depositPaid(false).build();
        when(reservations.findMemberIdById(31L)).thenReturn(Optional.of(7L));
        when(reservations.findByIdForPaymentUpdate(31L)).thenReturn(Optional.of(reservation));
        when(members.findByIdForPaymentUpdate(7L)).thenReturn(Optional.of(member));
    }

    private PaymentRequestDto request() {
        return PaymentRequestDto.builder().reservationId(31L).amount(100000).build();
    }
}
