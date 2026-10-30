package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationManagementAccessTest {
    @Mock ReservationRepository repository;
    @Mock PaymentService payments;
    @Mock AuditLogService audits;
    @InjectMocks ReservationService service;

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void businessViewAlwaysUsesOwnedReservations(Role role) {
        var owner = Member.builder().id(11L).role(role).build();
        when(repository.searchForStoreOwner(eq(owner), eq("찾기"), isNull(), eq(99L), any(Pageable.class))).thenReturn(Page.empty());
        assertThat(service.getStoreReservations(owner, 0, 1000, " 찾기 ", null, 99L, "recent")).isEmpty();
        verify(repository).searchForStoreOwner(eq(owner), eq("찾기"), isNull(), eq(99L),
                argThat(page -> page.getPageSize() == 100));
        verify(repository, never()).searchForAdmin(anyString(), any(), any(), any());
        when(repository.countOwnerReservationsGroupedByStatus(owner)).thenReturn(List.of());
        service.getStoreReservationSummary(owner);
        verify(repository).countOwnerReservationsGroupedByStatus(owner);
        verify(repository, never()).countAdminReservationsGroupedByStatus();
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"USER", "BUSINESS"})
    void nonAdminCannotRequestGlobalList(Role role) {
        var actor = Member.builder().id(11L).role(role).build();
        assertThatThrownBy(() -> service.getAdminReservations(actor, 0, 20, "", null, null, "recent"))
                .isInstanceOf(ReservationException.class);
        verifyNoInteractions(repository, payments);
    }

    @Test void explicitAdminReadKeepsGlobalPagination() {
        when(repository.searchForAdmin(eq("검색"), isNull(), isNull(), any(Pageable.class))).thenReturn(Page.empty());
        assertThat(service.getAdminReservations(Member.builder().id(99L).role(Role.ADMIN).build(),
                -1, 1000, " 검색 ", null, null, "oldest")).isEmpty();
        verify(repository).searchForAdmin(eq("검색"), isNull(), isNull(),
                argThat(page -> page.getPageNumber() == 0 && page.getPageSize() == 100
                        && page.getSort().getOrderFor("id").isAscending()));
    }

    private Reservation pending(boolean paid, boolean late) {
        return Reservation.builder().id(31L).member(Member.builder().id(22L).emailNotificationEnabled(false).build())
                .store(Store.builder().owner(Member.builder().id(11L).build()).allowLatePayment(late).build())
                .status(Reservation.ReservationStatus.PENDING).depositAmount(10000).depositPaid(paid).build();
    }

    private void stub(Reservation reservation) {
        when(repository.findByIdForUpdate(31L)).thenReturn(Optional.of(reservation));
    }

    @Test void cannotApproveAdvancePaymentBeforePaymentEvenAsStoreOwner() {
        var reservation = pending(false, false); stub(reservation);
        assertThatThrownBy(() -> service.approveReservation(31L, Member.builder().id(11L).role(Role.BUSINESS).build()))
                .isInstanceOf(ReservationException.class).hasMessageContaining("결제 후");
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        verify(payments).lockReservationForStateChange(31L);
        verifyNoMoreInteractions(payments);
    }

    @ParameterizedTest
    @ValueSource(strings = {"approve", "reject", "cancel", "undoApprove", "undoComplete", "complete", "noShow", "remove"})
    void adminRoleCannotWriteAnotherStoresReservationThroughBusinessActions(String action) {
        var reservation = pending(false, false);
        boolean financialLock = action.equals("reject") || action.equals("cancel");
        if (financialLock) when(payments.lockReservationPayments(31L)).thenReturn(reservation);
        else stub(reservation);
        var actor = Member.builder().id(99L).role(Role.ADMIN).build();
        assertThatThrownBy(() -> {
            switch (action) {
                case "approve" -> service.approveReservation(31L, actor);
                case "reject" -> service.rejectReservation(31L, actor, "확인");
                case "cancel" -> service.cancelReservationByStore(31L, actor, "확인");
                case "undoApprove" -> service.undoApprove(31L, actor);
                case "undoComplete" -> service.undoComplete(31L, actor);
                case "complete" -> service.completeReservation(31L, actor);
                case "noShow" -> service.markNoShow(31L, actor);
                case "remove" -> service.removeReservation(31L, actor);
                default -> throw new AssertionError();
            }
        }).isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN));
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        if (financialLock) verify(payments).lockReservationPayments(31L);
        else verify(payments).lockReservationForStateChange(31L);
        verifyNoMoreInteractions(payments);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void paidOrExplicitLatePaymentCanBeApprovedByActualOwner(boolean late) {
        var reservation = pending(!late, late); stub(reservation);
        service.approveReservation(31L, Member.builder().id(11L).role(Role.BUSINESS).build());
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
    }

    @ParameterizedTest
    @CsvSource({"22,COMPLETED", "22,CANCELLED", "22,REJECTED", "22,NO_SHOW",
            "11,COMPLETED", "11,CANCELLED", "11,REJECTED", "11,NO_SHOW"})
    void memberAndStoreOwnerCanHideFinalReservationsWithoutChangingPayment(Long actorId, Reservation.ReservationStatus status) {
        var reservation = pending(true, false); reservation.setStatus(status); stub(reservation);
        service.removeReservation(31L, Member.builder().id(actorId).build());
        assertThat(reservation.isDeleted()).isTrue();
        assertThat(reservation.getStatus()).isEqualTo(status);
        assertThat(reservation.getDepositPaid()).isTrue();
        verify(payments).lockReservationForStateChange(31L);
        verify(payments).requireReservationRemovable(reservation);
        verifyNoMoreInteractions(payments);
        verify(repository, never()).delete(any(Reservation.class));
        verify(audits).logReservationDelete(reservation);
    }

    @ParameterizedTest
    @CsvSource({"22,PENDING", "22,CONFIRMED", "22,UNCONFIRMED",
            "11,PENDING", "11,CONFIRMED", "11,UNCONFIRMED"})
    void neitherParticipantCanHideAnUnresolvedReservation(Long actorId, Reservation.ReservationStatus status) {
        var reservation = pending(false, false); reservation.setStatus(status); stub(reservation);
        assertThatThrownBy(() -> service.removeReservation(31L, Member.builder().id(actorId).build()))
                .isInstanceOfSatisfying(ReservationException.class,
                        error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.BAD_REQUEST));
        assertThat(reservation.isDeleted()).isFalse();
        assertThat(reservation.getStatus()).isEqualTo(status);
        verifyNoInteractions(audits);
        verify(payments).lockReservationForStateChange(31L);
        verifyNoMoreInteractions(payments);
    }

    @ParameterizedTest
    @EnumSource(value = Reservation.ReservationStatus.class, names = {"COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"})
    void unrelatedAdministratorCannotHideFinalReservations(Reservation.ReservationStatus status) {
        var reservation = pending(true, false); reservation.setStatus(status); stub(reservation);
        assertThatThrownBy(() -> service.removeReservation(31L, Member.builder().id(99L).role(Role.ADMIN).build()))
                .isInstanceOfSatisfying(ReservationException.class,
                        error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN));
        assertThat(reservation.isDeleted()).isFalse();
        verifyNoInteractions(audits);
    }
}
