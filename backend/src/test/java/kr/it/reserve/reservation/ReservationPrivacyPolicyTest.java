package kr.it.reserve.reservation;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.retention.ReservationPrivacyPolicy;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;

class ReservationPrivacyPolicyTest {
    private Reservation reservation(LocalDateTime end) {
        return Reservation.builder().id(1L).reservationCode("SYNTHETIC-1")
                .member(Member.builder().id(2L).name("합성 예약자").email("synthetic@example.test").build())
                .store(Store.builder().id(3L).name("합성 가게").build())
                .reservationDate(LocalDate.of(2020, 1, 1)).reservationTime(LocalTime.NOON)
                .usageEndsAt(end).specialRequest("합성 요청").cancelReason("합성 사유")
                .status(Reservation.ReservationStatus.CANCELLED).build();
    }

    @Test void personalInfoDisappearsExactlyAtThirtyDaysAfterUsageEnd() {
        var end = LocalDateTime.of(2020, 1, 1, 13, 0);
        var reservation = reservation(end);
        assertThat(ReservationPrivacyPolicy.hidden(reservation, end.plusDays(30).minusNanos(1))).isFalse();
        assertThat(ReservationPrivacyPolicy.hidden(reservation, end.plusDays(30))).isTrue();
        var management = ReservationResponse.fromManagementEntity(reservation);
        assertThat(management.isPersonalInfoHidden()).isTrue();
        assertThat(management.getMemberId()).isNull();
        assertThat(management.getMemberName()).isNull();
        assertThat(management.getMemberEmail()).isNull();
        assertThat(management.getSpecialRequest()).isNull();
        assertThat(management.getCancelReason()).isNull();
        assertThat(management.getReservationCode()).isEqualTo("SYNTHETIC-1");
        assertThat(management.getPersonalInfoVisibleUntil()).isEqualTo(end.plusDays(30).atZone(ServiceTime.ZONE).toInstant());
        assertThat(ReservationResponse.fromEntity(reservation).getMemberEmail()).isEqualTo("synthetic@example.test");
    }

    @Test void legacySlotsUseStoredDurationAndDayBookingsEndAtFollowingMidnight() {
        var reservation = reservation(null); reservation.setServiceDurationMinutes(90);
        assertThat(ReservationPrivacyPolicy.usageEnd(reservation)).isEqualTo(LocalDateTime.of(2020, 1, 1, 13, 30));
        reservation.getStore().setBookingType(Store.BookingType.DAY);
        assertThat(ReservationPrivacyPolicy.usageEnd(reservation)).isEqualTo(LocalDateTime.of(2020, 1, 2, 0, 0));
        reservation.setReservationDate(null);
        assertThat(ReservationPrivacyPolicy.hidden(reservation, ServiceTime.now())).isTrue();
    }

    @Test void currentManagementViewRetainsTheApprovedEmailProvision() {
        var response = ReservationResponse.fromManagementEntity(reservation(ServiceTime.now().plusDays(1)));
        assertThat(response.isPersonalInfoHidden()).isFalse();
        assertThat(response.getMemberEmail()).isEqualTo("synthetic@example.test");
    }
}
