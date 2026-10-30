package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;

class ReservationUndoWindowTest {
    private final Member owner = Member.builder().id(1L).role(Role.BUSINESS).build();
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final PaymentService payments = mock(PaymentService.class);
    private final EmailService emails = mock(EmailService.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private Reservation reservation;
    private ReservationService service;

    @BeforeEach
    void setUp() {
        reservation = Reservation.builder().id(20L)
                .store(Store.builder().id(3L).owner(owner).build())
                .member(Member.builder().id(2L).role(Role.USER).build())
                .reservationDate(ServiceTime.today().minusDays(1)).reservationTime(LocalTime.NOON).guestCount(1)
                .status(Reservation.ReservationStatus.COMPLETED)
                .depositPaid(true).depositAmount(20000).build();
        when(reservations.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));
        service = new ReservationService(reservations, stores, mock(HolidayService.class),
                payments, emails, mock(MemberRepository.class), mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class), mock(kr.it.reserve.reservation.admission.ReservationCreationGuard.class), org.mockito.Mockito.mock(kr.it.reserve.reservation.service.ReservationConsentService.class));
        org.springframework.test.util.ReflectionTestUtils.setField(service, "reservationEntityManager", mock(jakarta.persistence.EntityManager.class));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = 11)
    void missingOrOldChangeTimeCannotReopenCompletedReservation(Integer minutesAgo) {
        if (minutesAgo != null) {
            reservation.setUpdatedAt(LocalDateTime.now(Clock.systemDefaultZone()).minusMinutes(minutesAgo));
        }

        assertThatThrownBy(() -> service.undoComplete(20L, owner))
                .isInstanceOf(ReservationException.class).hasMessageContaining("되돌릴 수 있는 시간이 지났어요");

        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
        assertDepositIsUntouched();
    }

    @Test
    void recentCompletionCanBeUndoneWithoutARefundOrEmail() {
        reservation.setUpdatedAt(LocalDateTime.now(Clock.systemDefaultZone()).minusMinutes(1));

        service.undoComplete(20L, owner);

        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        assertDepositIsUntouched();
        verifyNoInteractions(stores);
    }

    @Test
    void futureCompletionCannotReclaimASeatTakenByAnotherReservation() {
        prepareFutureCompletion();
        when(reservations.sumActiveGuestsBySlotExcluding(3L, reservation.getReservationDate(), LocalTime.NOON, 20L))
                .thenReturn(1);

        assertThatThrownBy(() -> service.undoComplete(20L, owner))
                .isInstanceOf(ReservationException.class).hasMessageContaining("마감");

        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
        assertDepositIsUntouched();
        var order = inOrder(stores, reservations);
        order.verify(stores).findByIdForUpdate(3L);
        order.verify(reservations).sumActiveGuestsBySlotExcluding(3L, reservation.getReservationDate(), LocalTime.NOON, 20L);
    }

    @Test
    void futureCompletionCannotRestoreASecondActiveBookingForTheSameMember() {
        prepareFutureCompletion();
        when(reservations.existsActiveReservationByMemberAndStoreAndDateExcluding(
                2L, 3L, reservation.getReservationDate(), 20L)).thenReturn(true);

        assertThatThrownBy(() -> service.undoComplete(20L, owner))
                .isInstanceOf(ReservationException.class).hasMessageContaining("중복 예약");

        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
        verify(reservations, never()).sumActiveGuestsBySlotExcluding(3L, reservation.getReservationDate(), LocalTime.NOON, 20L);
        assertDepositIsUntouched();
    }

    @Test
    void futureCompletionCanReturnOnlyAfterTheLockedCapacityCheck() {
        prepareFutureCompletion();
        service.undoComplete(20L, owner);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        verify(stores).findByIdForUpdate(3L);
        verify(reservations).sumActiveGuestsBySlotExcluding(3L, reservation.getReservationDate(), LocalTime.NOON, 20L);
        assertDepositIsUntouched();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void futureCompletionCannotRestoreAClosedStoreOrWithdrawnCustomer(boolean closedStore) {
        prepareFutureCompletion();
        if (closedStore) reservation.getStore().softDelete();
        else reservation.getMember().withdraw("anonymous@example.test");
        assertThatThrownBy(() -> service.undoComplete(20L, owner))
                .isInstanceOf(ReservationException.class).hasMessageContaining("복구할 수 없어요");
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
        verify(reservations, never()).sumActiveGuestsBySlotExcluding(3L, reservation.getReservationDate(), LocalTime.NOON, 20L);
    }

    private void prepareFutureCompletion() {
        reservation.setUpdatedAt(LocalDateTime.now(Clock.systemDefaultZone()).minusMinutes(1));
        reservation.setReservationDate(ServiceTime.today().plusDays(1));
        reservation.getStore().setMaxCapacityPerSlot(1);
        when(stores.findByIdForUpdate(3L)).thenReturn(Optional.of(reservation.getStore()));
    }

    private void assertDepositIsUntouched() {
        assertThat(reservation.getDepositPaid()).isTrue();
        assertThat(reservation.getDepositAmount()).isEqualTo(20000);
        verify(payments).lockReservationForStateChange(20L);
        verifyNoMoreInteractions(payments);
        verifyNoInteractions(emails);
    }
}
