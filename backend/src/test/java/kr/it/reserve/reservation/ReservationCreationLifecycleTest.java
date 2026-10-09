package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.dto.ReservationSearchDto;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class ReservationCreationLifecycleTest {

    @Test
    @DisplayName("탈퇴와 직렬화된 최신 회원 행이 없으면 예약 생성을 시작하지 않는다")
    void deletedMemberCannotCreateReservationFromStalePrincipal() {
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        StoreRepository storeRepository = mock(StoreRepository.class);
        MemberRepository memberRepository = mock(MemberRepository.class);
        ReservationService service = new ReservationService(
                reservationRepository,
                storeRepository,
                mock(HolidayService.class),
                mock(PaymentService.class),
                mock(EmailService.class),
                memberRepository,
                mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class));

        Member stalePrincipal = Member.builder().id(1L).email("withdrawn@example.com").build();
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L,
                LocalDate.now().plusDays(1),
                LocalTime.NOON,
                1,
                null,
                false);
        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createReservation(request, stalePrincipal))
                .isInstanceOf(ReservationException.class);
        verify(storeRepository, never()).findByIdForUpdate(10L);
        verify(reservationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("영업 종료와 직렬화된 가게 행은 대기 중이던 예약도 거절한다")
    void closedStoreCannotAcceptQueuedReservation() {
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        StoreRepository storeRepository = mock(StoreRepository.class);
        MemberRepository memberRepository = mock(MemberRepository.class);
        ReservationService service = new ReservationService(
                reservationRepository,
                storeRepository,
                mock(HolidayService.class),
                mock(PaymentService.class),
                mock(EmailService.class),
                memberRepository,
                mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class));

        Member activeMember = Member.builder()
                .id(1L)
                .email("active@example.com")
                .termsAgreed(true)
                .build();
        Store closedStore = Store.builder().id(10L).name("종료 가게").build();
        closedStore.softDelete();
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L,
                LocalDate.now().plusDays(1),
                LocalTime.NOON,
                1,
                null,
                false);
        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.of(activeMember));
        when(storeRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(closedStore));

        assertThatThrownBy(() -> service.createReservation(request, activeMember))
                .isInstanceOf(ReservationException.class);
        verify(reservationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("latePaymentCases")
    void latePaymentPolicyIsEnforcedBeforeReservationWrites(
            String caseName, Integer deposit, Boolean allowLatePayment,
            Boolean skipPayment, boolean rejected) {
        Fixture fixture = fixture();
        Store store = bookableStore();
        store.setNoShowDeposit(deposit);
        store.setAllowLatePayment(allowLatePayment);
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L, ServiceTime.today().plusDays(1), LocalTime.of(11, 0), 1, null, skipPayment);
        prepareCreation(fixture, store);

        if (rejected) {
            assertRejectedCreation(fixture, request,
                    "이 가게는 나중 결제를 허용하지 않아요. 예약금을 즉시 결제해주세요.");
        } else {
            assertCreatedReservation(fixture, store, request);
        }
        verify(fixture.members()).findActiveByIdForUpdate(1L);
        verify(fixture.stores()).findByIdForUpdate(10L);
    }

    private static Stream<Arguments> latePaymentCases() {
        return Stream.of(
                Arguments.of("무료 예약은 결제 생략을 허용한다", 0, false, true, false),
                Arguments.of("나중 결제 허용 가게는 예약금을 유지한 채 생성한다", 1000, true, true, false),
                Arguments.of("즉시 결제 선택은 생성할 수 있다", 1000, false, false, false),
                Arguments.of("결제 생략 값이 없으면 즉시 결제 경로로 생성한다", 1000, false, null, false),
                Arguments.of("즉시 결제 필수 가게의 결제 생략은 거절한다", 1000, false, true, true)
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("breakTimeCases")
    void breakTimePolicyPreservesInclusiveStartAndExclusiveEnd(
            String caseName, Store.BookingType bookingType, LocalTime breakStart,
            LocalTime breakEnd, LocalTime requestedTime, boolean rejected) {
        Fixture fixture = fixture();
        Store store = bookableStore();
        store.setBookingType(bookingType);
        store.setBreakStartTime(breakStart);
        store.setBreakEndTime(breakEnd);
        if (bookingType == Store.BookingType.SESSION) {
            store.setSessionTimeList(List.of(requestedTime));
        }
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L, ServiceTime.today().plusDays(1), requestedTime, 1, null, false);
        prepareCreation(fixture, store);

        if (rejected) {
            assertRejectedCreation(fixture, request,
                    "브레이크 타임(12:00 ~ 13:00) 중에는 예약할 수 없어요. 다른 시간대를 선택해주세요.");
        } else {
            assertCreatedReservation(fixture, store, request);
        }
        verify(fixture.members()).findActiveByIdForUpdate(1L);
        verify(fixture.stores()).findByIdForUpdate(10L);
    }

    private static Stream<Arguments> breakTimeCases() {
        LocalTime start = LocalTime.NOON;
        LocalTime end = LocalTime.of(13, 0);
        return Stream.of(
                Arguments.of("시작이 없으면 브레이크를 적용하지 않는다", Store.BookingType.SLOT,
                        null, end, start, false),
                Arguments.of("종료가 없으면 브레이크를 적용하지 않는다", Store.BookingType.SLOT,
                        start, null, start, false),
                Arguments.of("브레이크 직전 슬롯은 예약 가능하다", Store.BookingType.SLOT,
                        start, end, LocalTime.of(11, 30), false),
                Arguments.of("브레이크 시작 슬롯은 거절한다", Store.BookingType.SLOT,
                        start, end, start, true),
                Arguments.of("브레이크 내부 슬롯은 거절한다", Store.BookingType.SLOT,
                        start, end, LocalTime.of(12, 30), true),
                Arguments.of("브레이크 종료 슬롯은 예약 가능하다", Store.BookingType.SLOT,
                        start, end, end, false),
                Arguments.of("명시한 회차에는 브레이크를 적용하지 않는다", Store.BookingType.SESSION,
                        start, end, start, false)
        );
    }

    @ParameterizedTest
    @EnumSource(MissingStoreLookup.class)
    void missingStoreFailsBeforeReservationMutationOrSearch(MissingStoreLookup lookup) {
        Fixture fixture = fixture();
        Store store = bookableStore();
        LocalDate originalDate = ServiceTime.today().plusDays(1);
        Reservation reservation = Reservation.builder()
                .id(20L).member(fixture.member()).store(store)
                .reservationDate(originalDate).reservationTime(LocalTime.of(11, 0))
                .guestCount(1).specialRequest("original")
                .status(Reservation.ReservationStatus.PENDING).depositPaid(false).build();
        Runnable operation;
        if (lookup == MissingStoreLookup.UPDATE) {
            when(fixture.reservations().findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));
            when(fixture.stores().findByIdForUpdate(10L)).thenReturn(Optional.empty());
            ReservationUpdateRequest request = new ReservationUpdateRequest(
                    originalDate.plusDays(1), LocalTime.of(14, 0), 2, "changed", null);
            operation = () -> fixture.service().updateReservation(20L, request, fixture.member());
        } else {
            when(fixture.stores().findById(10L)).thenReturn(Optional.empty());
            operation = () -> fixture.service().searchReservations(
                    10L, new ReservationSearchDto(), store.getOwner());
        }

        assertThatThrownBy(operation::run).isInstanceOfSatisfying(ReservationException.class, exception -> {
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(exception).hasMessage("가게를 찾을 수 없어요.");
        });

        if (lookup == MissingStoreLookup.UPDATE) {
            verify(fixture.reservations()).findByIdForUpdate(20L);
            verify(fixture.stores()).findByIdForUpdate(10L);
            assertThat(reservation.getReservationDate()).isEqualTo(originalDate);
            assertThat(reservation.getReservationTime()).isEqualTo(LocalTime.of(11, 0));
            assertThat(reservation.getGuestCount()).isEqualTo(1);
            assertThat(reservation.getSpecialRequest()).isEqualTo("original");
            assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        } else {
            verify(fixture.stores()).findById(10L);
        }
        verifyNoMoreInteractions(fixture.reservations(), fixture.stores());
        verifyNoInteractions(fixture.members(), fixture.payments(), fixture.emails(), fixture.audits());
    }

    private static void prepareCreation(Fixture fixture, Store store) {
        when(fixture.members().findActiveByIdForUpdate(1L)).thenReturn(Optional.of(fixture.member()));
        when(fixture.stores().findByIdForUpdate(10L)).thenReturn(Optional.of(store));
    }

    private static void assertRejectedCreation(
            Fixture fixture, ReservationCreateRequest request, String expectedMessage) {
        assertThatThrownBy(() -> fixture.service().createReservation(request, fixture.member()))
                .isInstanceOfSatisfying(ReservationException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception).hasMessage(expectedMessage);
                });
        verifyNoInteractions(fixture.reservations(), fixture.payments(), fixture.emails(), fixture.audits());
    }

    private static void assertCreatedReservation(
            Fixture fixture, Store store, ReservationCreateRequest request) {
        when(fixture.reservations().save(any(Reservation.class))).thenAnswer(invocation -> {
            Reservation saved = invocation.getArgument(0);
            saved.setId(20L);
            return saved;
        });

        ReservationResponse response = fixture.service().createReservation(request, fixture.member());

        ArgumentCaptor<Reservation> saved = ArgumentCaptor.forClass(Reservation.class);
        verify(fixture.reservations()).save(saved.capture());
        assertThat(saved.getValue().getMember()).isSameAs(fixture.member());
        assertThat(saved.getValue().getStore()).isSameAs(store);
        assertThat(response.getId()).isEqualTo(20L);
        assertThat(response.getReservationDate()).isEqualTo(request.getReservationDate());
        assertThat(response.getReservationTime()).isEqualTo(request.getReservationTime());
        assertThat(response.getGuestCount()).isEqualTo(1);
        assertThat(response.getStatus()).isEqualTo("PENDING");
        assertThat(response.getDepositAmount()).isEqualTo(store.getNoShowDeposit());
        assertThat(response.getDepositPaid()).isFalse();
        verifyNoInteractions(fixture.payments(), fixture.emails(), fixture.audits());
    }

    private static Store bookableStore() {
        return Store.builder()
                .id(10L).owner(Member.builder().id(2L).email("owner@example.com").build())
                .name("계약 검사 가게").bookingType(Store.BookingType.SLOT)
                .openTime(LocalTime.of(9, 0)).closeTime(LocalTime.of(18, 0))
                .reservationSlotMinutes(30).emailNotificationEnabled(false).build();
    }

    @Test
    void waitingOnlyStoreRejectsDirectReservationRequestsBeforeAnyReservationOrPaymentWrite() {
        Fixture fixture = fixture();
        Store store = bookableStore();
        store.setReservationEnabled(false);
        when(fixture.members().findActiveByIdForUpdate(1L)).thenReturn(Optional.of(fixture.member()));
        when(fixture.stores().findByIdForUpdate(10L)).thenReturn(Optional.of(store));
        var request = new ReservationCreateRequest(10L, ServiceTime.today().plusDays(1), LocalTime.NOON, 1, null, false);
        assertThatThrownBy(() -> fixture.service().createReservation(request, fixture.member()))
                .isInstanceOf(ReservationException.class).hasMessageContaining("예약 접수");
        verifyNoInteractions(fixture.reservations(), fixture.payments(), fixture.emails(), fixture.audits());
    }

    private static Fixture fixture() {
        ReservationRepository reservations = mock(ReservationRepository.class);
        StoreRepository stores = mock(StoreRepository.class);
        MemberRepository members = mock(MemberRepository.class);
        PaymentService payments = mock(PaymentService.class);
        EmailService emails = mock(EmailService.class);
        AuditLogService audits = mock(AuditLogService.class);
        Member member = Member.builder().id(1L).email("active@example.com").termsAgreed(true).build();
        ReservationService service = new ReservationService(
                reservations, stores, mock(HolidayService.class), payments, emails, members,
                audits, mock(QrCheckinTokenProvider.class));
        return new Fixture(service, reservations, stores, members, payments, emails, audits, member);
    }

    private enum MissingStoreLookup { UPDATE, SEARCH }

    private record Fixture(
            ReservationService service, ReservationRepository reservations, StoreRepository stores,
            MemberRepository members, PaymentService payments, EmailService emails,
            AuditLogService audits, Member member) { }
}
