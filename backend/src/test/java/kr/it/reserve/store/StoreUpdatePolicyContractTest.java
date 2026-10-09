package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.DataBinder;
import org.springframework.beans.MutablePropertyValues;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Transactional
class StoreUpdatePolicyContractTest {
    @Autowired EntityManager em;
    @Autowired StoreService service;

    @Test
    void aPartialIdentityEditPreservesPeriodHolidaysCapacitySessionsAndCutoff() {
        Store store = store();
        var opening = store.getOpenDate();
        var closing = store.getCloseDate();
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setName("소개만 수정");
        service.updateStore(store.getId(), request, store.getOwner());
        em.flush(); em.clear();
        Store saved = em.find(Store.class, store.getId());
        assertThat(saved.getOpenDate()).isEqualTo(opening);
        assertThat(saved.getCloseDate()).isEqualTo(closing);
        assertThat(saved.getClosedDayList()).containsExactly(7);
        assertThat(saved.getClosedDateList()).containsExactly(ServiceTime.today().plusDays(7));
        assertThat(saved.getMaxCapacityPerSlot()).isEqualTo(3);
        assertThat(saved.getMaxAdvanceBookingDays()).isEqualTo(45);
        assertThat(saved.getBookingDeadlineHours()).isEqualTo(2);
        assertThat(saved.getSessionTimeList()).containsExactly(LocalTime.of(11, 0));
        assertThat(saved.getBreakStartTime()).isEqualTo(LocalTime.NOON);
    }

    @Test
    void multipartBlankValuesClearOnlyTheirExplicitFields() {
        Store store = store();
        StoreUpdateRequest request = new StoreUpdateRequest();
        DataBinder binder = new DataBinder(request);
        binder.bind(new MutablePropertyValues(java.util.Map.of(
                "closedDays", "", "closedDates", "", "openDate", "", "closeDate", "",
                "maxCapacityPerSlot", "", "maxAdvanceBookingDays", "", "bookingDeadlineHours", "")));
        assertThat(binder.getBindingResult().hasErrors()).isFalse();
        service.updateStore(store.getId(), request, store.getOwner());
        assertThat(store.getClosedDayList()).isEmpty();
        assertThat(store.getClosedDateList()).isEmpty();
        assertThat(store.getOpenDate()).isNull();
        assertThat(store.getCloseDate()).isNull();
        assertThat(store.getMaxCapacityPerSlot()).isNull();
        assertThat(store.getMaxAdvanceBookingDays()).isNull();
        assertThat(store.getBookingDeadlineHours()).isNull();
        assertThat(store.getSessionTimeList()).containsExactly(LocalTime.of(11, 0));
    }

    @Test
    void aFreeStoreDisablesLatePaymentAndAcceptsAnAbsentCutoff() {
        Store store = store();
        store.setBookingDeadlineHours(null);
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setNoShowDeposit(0);
        request.setAllowLatePayment(true);
        service.updateStore(store.getId(), request, store.getOwner());
        assertThat(store.getAllowLatePayment()).isFalse();
        assertThat(store.getNoShowDeposit()).isZero();
    }

    @Test
    void remainingPaidReservationsBlockARefundPolicyChange() {
        Store store = store();
        reservation(store, Reservation.ReservationStatus.PENDING, 3000);
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setFullRefundDays(5);
        assertThatThrownBy(() -> service.updateStore(store.getId(), request, store.getOwner()))
                .isInstanceOf(StoreException.class).hasMessageContaining("남아 있는 유료 예약");
        assertThat(store.getFullRefundDays()).isEqualTo(3);
    }

    @Test
    void aCanceledFutureReservationWithAPaidLedgerStillProtectsItsRefundTerms() {
        Store store = store();
        Reservation reservation = reservation(store, Reservation.ReservationStatus.CANCELLED, 0);
        em.persist(Payment.builder().member(store.getOwner()).reservation(reservation)
                .merchantUid("policy-" + UUID.randomUUID()).amount(3000).status(Payment.PaymentStatus.PAID).build());
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setPartialRefundRate(25);
        assertThatThrownBy(() -> service.updateStore(store.getId(), request, store.getOwner()))
                .isInstanceOf(StoreException.class).hasMessageContaining("남아 있는 유료 예약");
    }

    @Test
    void freeReservationsAndAnUnchangedPolicyDoNotBlockOtherEdits() {
        Store store = store();
        reservation(store, Reservation.ReservationStatus.PENDING, 0);
        StoreUpdateRequest refund = new StoreUpdateRequest(); refund.setFullRefundDays(5);
        service.updateStore(store.getId(), refund, store.getOwner());
        assertThat(store.getFullRefundDays()).isEqualTo(5);
        reservation(store, Reservation.ReservationStatus.CONFIRMED, 3000);
        StoreUpdateRequest name = new StoreUpdateRequest(); name.setName("정책 유지");
        name.setFullRefundDays(5); name.setPartialRefundDays(1); name.setPartialRefundRate(50);
        service.updateStore(store.getId(), name, store.getOwner());
        assertThat(store.getName()).isEqualTo("정책 유지");
    }

    private Store store() {
        Member owner = Member.builder().name("설정 검증").email(UUID.randomUUID() + "@example.invalid").role(Role.BUSINESS).build();
        em.persist(owner);
        Store store = Store.builder().name("설정 검증").owner(owner).category("카페")
                .openTime(LocalTime.of(9, 0)).closeTime(LocalTime.of(18, 0))
                .breakStartTime(LocalTime.NOON).breakEndTime(LocalTime.of(13, 0))
                .openDate(ServiceTime.today()).closeDate(ServiceTime.today().plusDays(90))
                .maxCapacityPerSlot(3).maxAdvanceBookingDays(45).bookingDeadlineHours(2)
                .noShowDeposit(3000).fullRefundDays(3).partialRefundDays(1).partialRefundRate(50).build();
        store.setClosedDayList(List.of(7)); store.setClosedDateList(List.of(ServiceTime.today().plusDays(7)));
        store.setBookingType(Store.BookingType.SESSION);
        store.setSessionTimeList(List.of(LocalTime.of(11, 0)));
        em.persist(store); em.flush();
        return store;
    }

    private Reservation reservation(Store store, Reservation.ReservationStatus status, int amount) {
        Reservation reservation = Reservation.builder().member(store.getOwner()).store(store)
                .reservationDate(ServiceTime.today().plusDays(10)).reservationTime(LocalTime.NOON)
                .guestCount(1).status(status).depositAmount(amount).depositPaid(false).build();
        em.persist(reservation); em.flush();
        return reservation;
    }
}
