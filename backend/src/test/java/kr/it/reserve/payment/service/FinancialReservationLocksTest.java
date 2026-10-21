package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FinancialReservationLocksTest {
    private final MemberRepository members = mock(MemberRepository.class);
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final FinancialReservationLocks locks = new FinancialReservationLocks(members, reservations, entityManager);

    @ParameterizedTest
    @CsvSource({"3,9", "9,3"})
    void payerAndDifferentAdminAreAlwaysLockedByAscendingMemberIdBeforeTheReservation(long payerId, long actorId) {
        Member payer = Member.builder().id(payerId).deletedAt(LocalDateTime.now()).build();
        Member actor = Member.builder().id(actorId).build();
        Member owner = Member.builder().id(5L).build();
        when(reservations.findMemberIdById(30L)).thenReturn(Optional.of(payerId));
        when(reservations.findOwnerIdById(30L)).thenReturn(Optional.of(5L));
        when(members.findByIdForPaymentUpdate(payerId)).thenReturn(Optional.of(payer));
        when(members.findByIdForPaymentUpdate(actorId)).thenReturn(Optional.of(actor));
        when(members.findByIdForPaymentUpdate(5L)).thenReturn(Optional.of(owner));
        Reservation reservation = Reservation.builder().id(30L).member(payer).build();
        when(reservations.findByIdForPaymentUpdate(30L)).thenReturn(Optional.of(reservation));

        assertThat(locks.lock(30L, actorId).actor()).isSameAs(actor);

        var order = inOrder(members, reservations);
        order.verify(reservations).findMemberIdById(30L);
        order.verify(members).findByIdForPaymentUpdate(3L);
        order.verify(members).findByIdForPaymentUpdate(5L);
        order.verify(members).findByIdForPaymentUpdate(9L);
        order.verify(reservations).findByIdForPaymentUpdate(30L);
    }

    @Test
    void aWithdrawnActorCannotUseTheExternalRefundEntryEvenThoughHistoricalPayersRemainLockable() {
        Member actor = Member.builder().id(3L).deletedAt(LocalDateTime.now()).build();
        when(reservations.findMemberIdById(30L)).thenReturn(Optional.of(3L));
        when(members.findByIdForPaymentUpdate(3L)).thenReturn(Optional.of(actor));

        assertThatThrownBy(() -> locks.lock(30L, 3L)).isInstanceOf(MemberException.class);

        verify(reservations, never()).findByIdForPaymentUpdate(30L);
    }
}
