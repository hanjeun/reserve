package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.QrCheckinResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QrCheckinAttendanceTest {

    private ReservationRepository reservationRepository;
    private QrCheckinTokenProvider tokenProvider;
    private ReservationService reservationService;

    @BeforeEach
    void setUp() {
        reservationRepository = mock(ReservationRepository.class);
        tokenProvider = mock(QrCheckinTokenProvider.class);
        reservationService = new ReservationService(
                reservationRepository,
                mock(StoreRepository.class),
                mock(HolidayService.class),
                mock(PaymentService.class),
                mock(EmailService.class),
                mock(MemberRepository.class),
                mock(AuditLogService.class),
                tokenProvider);
    }

    @Test
    @DisplayName("승인된 예약 QR은 상태를 바꾸지 않고 실제 체크인 시각만 기록한다")
    void recordsAttendanceWithoutApprovingOrCompleting() {
        Member owner = member(1L);
        Reservation reservation = reservation(owner, Reservation.ReservationStatus.CONFIRMED);
        when(tokenProvider.parseReservationId("token")).thenReturn(20L);
        when(reservationRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));

        QrCheckinResponse response = reservationService.checkInByQrToken("token", owner);

        assertThat(response.isAlreadyCheckedIn()).isFalse();
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        assertThat(reservation.getCheckedInAt()).isNotNull();
        assertThat(response.getReservation().getCheckedInAt()).isEqualTo(reservation.getCheckedInAt());
    }

    @Test
    @DisplayName("같은 QR을 다시 스캔하면 기존 체크인 시각을 보존하며 멱등 성공한다")
    void repeatedScanKeepsOriginalAttendanceTime() {
        Member owner = member(1L);
        Reservation reservation = reservation(owner, Reservation.ReservationStatus.UNCONFIRMED);
        LocalDateTime firstCheckIn = LocalDateTime.of(2026, 9, 2, 10, 3);
        reservation.setCheckedInAt(firstCheckIn);
        when(tokenProvider.parseReservationId("token")).thenReturn(20L);
        when(reservationRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));

        QrCheckinResponse response = reservationService.checkInByQrToken("token", owner);

        assertThat(response.isAlreadyCheckedIn()).isTrue();
        assertThat(reservation.getCheckedInAt()).isEqualTo(firstCheckIn);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.UNCONFIRMED);
    }

    @Test
    @DisplayName("승인 전 PENDING 예약은 QR로 승인 상태를 우회할 수 없다")
    void pendingReservationCannotBeCheckedIn() {
        Member owner = member(1L);
        Reservation reservation = reservation(owner, Reservation.ReservationStatus.PENDING);
        when(tokenProvider.parseReservationId("token")).thenReturn(20L);
        when(reservationRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));

        assertThatThrownBy(() -> reservationService.checkInByQrToken("token", owner))
                .isInstanceOf(ReservationException.class)
                .hasMessageContaining("승인된 예약");
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(reservation.getCheckedInAt()).isNull();
    }

    @Test
    @DisplayName("이미 체크인된 예약은 노쇼로 바꿀 수 없다")
    void checkedInReservationCannotBecomeNoShow() {
        Member owner = member(1L);
        Reservation reservation = reservation(owner, Reservation.ReservationStatus.CONFIRMED);
        reservation.setCheckedInAt(ServiceTime.now());
        when(reservationRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(reservation));

        assertThatThrownBy(() -> reservationService.markNoShow(20L, owner))
                .isInstanceOf(ReservationException.class)
                .hasMessageContaining("체크인된 예약");
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
    }

    private Reservation reservation(Member owner, Reservation.ReservationStatus status) {
        Store store = Store.builder()
                .id(10L)
                .owner(owner)
                .name("가게")
                .build();
        return Reservation.builder()
                .id(20L)
                .store(store)
                .member(member(7L))
                .reservationDate(ServiceTime.today())
                .reservationTime(LocalTime.of(12, 0))
                .guestCount(2)
                .status(status)
                .depositPaid(false)
                .depositAmount(0)
                .build();
    }

    private Member member(Long id) {
        return Member.builder()
                .id(id)
                .name("회원" + id)
                .email("member" + id + "@example.com")
                .build();
    }
}
