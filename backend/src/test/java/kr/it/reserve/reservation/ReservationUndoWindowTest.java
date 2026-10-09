package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReservationUndoWindowTest {
    private final Member owner = Member.builder().id(1L).role(Role.BUSINESS).build();
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final PaymentService payments = mock(PaymentService.class);
    private final EmailService emails = mock(EmailService.class);
    private Reservation reservation;
    private ReservationService service;

    @BeforeEach
    void setUp() {
        reservation = Reservation.builder().id(20L)
                .store(Store.builder().id(3L).owner(owner).build())
                .status(Reservation.ReservationStatus.COMPLETED)
                .depositPaid(true).depositAmount(20000).build();
        when(reservations.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));
        service = new ReservationService(reservations, mock(StoreRepository.class), mock(HolidayService.class),
                payments, emails, mock(MemberRepository.class), mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class));
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
    }

    private void assertDepositIsUntouched() {
        assertThat(reservation.getDepositPaid()).isTrue();
        assertThat(reservation.getDepositAmount()).isEqualTo(20000);
        verifyNoInteractions(payments, emails);
    }
}
