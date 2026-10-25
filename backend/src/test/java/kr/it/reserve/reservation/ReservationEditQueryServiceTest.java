package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.admission.ReservationCreationGuard;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationEditQueryService;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationEditQueryServiceTest {
    @Mock ReservationRepository reservations;
    @Mock ReservationService reservationService;
    @Mock StoreService storeService;
    @InjectMocks ReservationEditQueryService queries;
    private final Member member = Member.builder().id(7L).role(Role.USER).build();
    private final Member owner = Member.builder().id(8L).role(Role.BUSINESS).build();
    private final Store store = Store.builder().id(10L).owner(owner).build();
    private final Reservation reservation = Reservation.builder().id(23L).member(member).store(store)
            .status(Reservation.ReservationStatus.PENDING).depositPaid(false).build();
    private final LocalDate date = LocalDate.of(2030, 1, 10);
    private final YearMonth month = YearMonth.of(2030, 1);

    @ParameterizedTest
    @EnumSource(value = Reservation.ReservationStatus.class, names = {"PENDING", "CONFIRMED"})
    void editableMemberGetsOnlyTheExistingPublicReadResultsWithoutMutations(Reservation.ReservationStatus status) {
        givenReservation();
        reservation.setStatus(status);
        StoreResponse publicStore = StoreResponse.builder().id(10L).name("공개 가게").build();
        List<SlotAvailabilityResponse> slots = List.of(new SlotAvailabilityResponse("12:00", false));
        List<CalendarDayResponse> days = List.of(new CalendarDayResponse("2030-01-10", "FULL", 1, 0, false));
        when(storeService.getStore(10L)).thenReturn(publicStore);
        when(reservationService.getAvailability(10L, date)).thenReturn(slots);
        when(reservationService.getMonthCalendar(10L, month)).thenReturn(days);

        assertThat(queries.getEditStore(23L, 10L, member)).isSameAs(publicStore);
        assertThat(queries.getEditAvailability(23L, 10L, date, member)).isSameAs(slots);
        assertThat(queries.getEditCalendar(23L, 10L, month, member)).isSameAs(days);

        verify(reservations, times(3)).findById(23L);
        verify(storeService).getStore(10L);
        verify(reservationService).getAvailability(10L, date);
        verify(reservationService).getMonthCalendar(10L, month);
        verifyNoMoreInteractions(reservations, storeService, reservationService);
        assertThat(reservation.getStatus()).isEqualTo(status);
        assertThat(reservation.getDepositPaid()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(Role.class)
    void aDifferentMemberHasNoOwnerOrAdministratorBypass(Role role) {
        givenReservation();
        denyEveryRead(Member.builder().id(8L).role(role).build(), 10L, HttpStatus.FORBIDDEN);
        verifyNoInteractions(storeService, reservationService);
    }

    @Test
    void cannotUseAnOwnedReservationAsAReadPassForAnotherStore() {
        givenReservation();
        denyEveryRead(member, 999L, HttpStatus.BAD_REQUEST);
        verifyNoInteractions(storeService, reservationService);
    }

    @ParameterizedTest
    @EnumSource(value = Reservation.ReservationStatus.class, names = {"PENDING", "CONFIRMED"}, mode = EnumSource.Mode.EXCLUDE)
    void finishedStatesAreRejectedByTheSameGuardAsTheFinalPatch(Reservation.ReservationStatus status) {
        givenReservation();
        reservation.setStatus(status);
        denyEveryRead(member, 10L, HttpStatus.BAD_REQUEST);
        assertPatchGuardRejects();
    }

    @Test
    void paidReservationsAreRejectedByTheSameGuardAsTheFinalPatch() {
        givenReservation();
        reservation.setDepositPaid(true);
        denyEveryRead(member, 10L, HttpStatus.BAD_REQUEST);
        assertPatchGuardRejects();
    }

    @Test
    void missingAndDeletedReservationsCannotSupplyAnEditContext() {
        when(reservations.findById(23L)).thenReturn(Optional.empty());
        denyEveryRead(member, 10L, HttpStatus.NOT_FOUND);
        givenReservation();
        reservation.setDeletedAt(LocalDateTime.now());
        denyEveryRead(member, 10L, HttpStatus.NOT_FOUND);
        verifyNoInteractions(storeService, reservationService);
    }

    @Test
    void deletedOrSuspendedStoresAndSuspendedOwnersStayUnavailable() {
        givenReservation();
        store.setDeletedAt(LocalDateTime.now());
        denyEveryRead(member, 10L, HttpStatus.NOT_FOUND);
        store.setDeletedAt(null);
        store.suspend(null, "synthetic");
        denyEveryRead(member, 10L, HttpStatus.NOT_FOUND);
        store.setStatus(kr.it.reserve.store.entity.StoreStatus.ACTIVE);
        owner.suspend(null, "synthetic");
        denyEveryRead(member, 10L, HttpStatus.BAD_REQUEST);
        verifyNoInteractions(storeService, reservationService);
    }

    @Test
    void downstreamReadErrorsPropagateWithoutFallingBackToAnUnguardedPublicRequest() {
        givenReservation();
        StoreException unavailable = StoreException.notFound();
        when(storeService.getStore(10L)).thenThrow(unavailable);
        assertThatThrownBy(() -> queries.getEditStore(23L, 10L, member)).isSameAs(unavailable);
        verify(storeService).getStore(10L);
        verifyNoMoreInteractions(storeService);
        verifyNoInteractions(reservationService);
    }

    private void givenReservation() {
        when(reservations.findById(23L)).thenReturn(Optional.of(reservation));
    }

    private void denyEveryRead(Member reader, Long expectedStoreId, HttpStatus status) {
        List<Runnable> reads = List.of(() -> queries.getEditStore(23L, expectedStoreId, reader),
                () -> queries.getEditAvailability(23L, expectedStoreId, date, reader),
                () -> queries.getEditCalendar(23L, expectedStoreId, month, reader));
        for (Runnable read : reads) assertThatThrownBy(read::run).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(status));
    }

    private void assertPatchGuardRejects() {
        StoreRepository stores = mock(StoreRepository.class);
        PaymentService payments = mock(PaymentService.class);
        ReservationService mutations = new ReservationService(reservations, stores, mock(HolidayService.class), payments,
                mock(EmailService.class), mock(MemberRepository.class), mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class), mock(ReservationCreationGuard.class));
        when(reservations.findByIdForUpdate(23L)).thenReturn(Optional.of(reservation));
        assertThatThrownBy(() -> mutations.updateReservation(23L, new ReservationUpdateRequest(), member))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(stores, storeService, reservationService);
        verify(reservations, never()).save(any());
    }
}
