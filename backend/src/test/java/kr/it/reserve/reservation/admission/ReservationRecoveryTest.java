package kr.it.reserve.reservation.admission;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReservationRecoveryTest {
    private static final String KEY = "11111111-1111-4111-8111-111111111111";
    private final ReservationRequestRepository requests = mock(ReservationRequestRepository.class);
    private final AdmissionService admission = mock(AdmissionService.class);
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final PaymentService payments = mock(PaymentService.class);
    private final EmailService emails = mock(EmailService.class);
    private final AuditLogService audits = mock(AuditLogService.class);
    private final QrCheckinTokenProvider qr = mock(QrCheckinTokenProvider.class);
    private final Member member = Member.builder().id(1L).name("synthetic").email("synthetic@example.test").build();
    private ReservationService service;
    private ReservationCreateRequest request;
    private Reservation reservation;

    @BeforeEach
    void prepare() {
        request = new ReservationCreateRequest(10L, LocalDate.now().plusDays(2), LocalTime.NOON, 1, null, false);
        request.setRequestId(KEY);
        var guard = new ReservationCreationGuard(requests, admission);
        service = new ReservationService(reservations, stores, mock(HolidayService.class), payments, emails, members, audits, qr, guard);
        reservation = Reservation.builder().id(50L).member(member).store(Store.builder().id(10L).name("synthetic").build())
                .reservationDate(request.getReservationDate()).reservationTime(request.getReservationTime()).guestCount(1).build();
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        when(requests.findCommittedByMemberIdAndRequestKey(1L, KEY)).thenReturn(Optional.of(
                new ReservationRequest(1L, KEY, ReservationCreationGuard.fingerprint(request), 50L)));
        when(reservations.findById(50L)).thenReturn(Optional.of(reservation));
    }

    @AfterEach
    void noWritesClaimsOrFinancialEffects() {
        verifyNoInteractions(admission, stores, payments, emails, audits, qr);
        verify(members, never()).findActiveByIdForUpdate(any());
        verify(requests, never()).findByMemberIdAndRequestKey(any(), any());
        verify(requests, never()).saveAndFlush(any());
        verify(reservations, never()).save(any());
        verify(reservations, never()).findByIdForUpdate(any());
    }

    @Test
    void committedSameMemberAndPayloadRecoverWithoutAnyAdmissionTicket() {
        request.setAdmissionTicket("expired-or-unrelated-ticket");
        var result = service.recoverReservation(request, member);
        assertThat(result.getId()).isEqualTo(50L);
        assertThat(result.getMemberId()).isEqualTo(1L);
        verify(requests).findCommittedByMemberIdAndRequestKey(1L, KEY);
    }

    @Test
    void missingCommittedResultReturnsNullWithoutReadingOrCreatingAReservation() {
        when(requests.findCommittedByMemberIdAndRequestKey(1L, KEY)).thenReturn(Optional.empty());
        assertThat(service.recoverReservation(request, member)).isNull();
        verifyNoInteractions(reservations);
    }

    @Test
    void anotherMemberCannotDiscoverTheSameRequestKey() {
        var other = Member.builder().id(2L).build();
        when(members.findByIdAndDeletedAtIsNull(2L)).thenReturn(Optional.of(other));
        when(requests.findCommittedByMemberIdAndRequestKey(2L, KEY)).thenReturn(Optional.empty());
        assertThat(service.recoverReservation(request, other)).isNull();
        verify(requests, never()).findCommittedByMemberIdAndRequestKey(1L, KEY);
        verifyNoInteractions(reservations);
    }

    @Test
    void changedPayloadIsAConflictBeforeAnyReservationRead() {
        request.setGuestCount(2);
        assertThatThrownBy(() -> service.recoverReservation(request, member)).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        verifyNoInteractions(reservations);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"not-a-uuid", "11111111-1111-4111-8111-11111111111Z"})
    void recoveryRequiresACanonicalRequestKey(String key) {
        request.setRequestId(key);
        assertThatThrownBy(() -> service.recoverReservation(request, member)).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(requests, reservations);
    }

    @Test
    void aWithdrawnMemberCannotRecoverPrivateReservationData() {
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.recoverReservation(request, member)).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        verifyNoInteractions(requests, reservations);
    }

    @Test
    void reservationOwnershipIsCheckedEvenIfAResultMappingIsInconsistent() {
        reservation.setMember(Member.builder().id(2L).build());
        assertThatThrownBy(() -> service.recoverReservation(request, member)).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void aDeletedReservationCannotBeRecoveredOrRecreatedByARead() {
        reservation.softDelete();
        assertThatThrownBy(() -> service.recoverReservation(request, member)).isInstanceOfSatisfying(ReservationException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void recoveryTransactionAndRepositoryLookupKeepTheReadOnlyContract() throws Exception {
        var transaction = ReservationService.class.getMethod("recoverReservation", ReservationCreateRequest.class, Member.class)
                .getAnnotation(Transactional.class);
        assertThat(transaction.readOnly()).isTrue();
        assertThat(ReservationRequestRepository.class.getMethod("findCommittedByMemberIdAndRequestKey", Long.class, String.class)
                .getAnnotation(Lock.class)).isNull();
    }
}
