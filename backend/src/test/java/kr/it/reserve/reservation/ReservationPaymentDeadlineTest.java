package kr.it.reserve.reservation;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class ReservationPaymentDeadlineTest {
    private Reservation reservation() {
        Store store = Store.builder().paymentTimeoutMinutes(10).allowLatePayment(false).build();
        return Reservation.builder().store(store).member(Member.builder().name("회원").build())
                .status(Reservation.ReservationStatus.PENDING).depositAmount(10000).depositPaid(false)
                .createdAt(LocalDateTime.of(2026, 10, 27, 12, 0)).build();
    }

    @ParameterizedTest
    @CsvSource({"UTC,2026-10-27T12:10:00Z", "Asia/Seoul,2026-10-27T03:10:00Z"})
    void exposesTheSameDeadlineAsTheServerExpiryClock(String zone, String expected) {
        TimeZone before = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(zone));
            assertThat(ReservationResponse.fromEntity(reservation()).getPaymentDeadline()).isEqualTo(Instant.parse(expected));
        } finally {
            TimeZone.setDefault(before);
        }
    }

    @Test
    void missingTimeoutKeepsTheExistingThirtyMinutePolicy() {
        Reservation item = reservation();
        item.getStore().setPaymentTimeoutMinutes(null);
        Instant tenMinutes = ReservationResponse.fromEntity(item).getPaymentDeadline().minusSeconds(20 * 60);
        item.getStore().setPaymentTimeoutMinutes(10);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isEqualTo(tenMinutes);
    }

    @ParameterizedTest
    @EnumSource(value = Reservation.ReservationStatus.class, names = "PENDING", mode = EnumSource.Mode.EXCLUDE)
    void closedOrApprovedReservationsHaveNoPaymentCountdown(Reservation.ReservationStatus status) {
        Reservation item = reservation();
        item.setStatus(status);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    void unlimitedTimeoutHasNoDeadline(int timeout) {
        Reservation item = reservation();
        item.getStore().setPaymentTimeoutMinutes(timeout);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
    }

    @Test
    void latePaymentAndPaidReservationsHaveNoDeadline() {
        Reservation item = reservation();
        item.getStore().setAllowLatePayment(true);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
        item.getStore().setAllowLatePayment(false);
        item.setDepositPaid(true);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, -1})
    void freeOrMissingDepositHasNoDeadline(Integer amount) {
        Reservation item = reservation();
        item.setDepositAmount(amount);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
    }

    @Test
    void missingCreationTimeIsNotReplacedByANewPaymentWindow() {
        Reservation item = reservation();
        item.setCreatedAt(null);
        assertThat(ReservationResponse.fromEntity(item).getPaymentDeadline()).isNull();
    }
}
