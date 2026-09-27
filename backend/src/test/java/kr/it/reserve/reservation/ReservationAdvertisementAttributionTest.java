package kr.it.reserve.reservation;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ReservationAdvertisementAttributionTest {

    private static final List<Reservation.ReservationStatus> ELIGIBLE_STATUSES =
            List.of(Reservation.ReservationStatus.PENDING, Reservation.ReservationStatus.CONFIRMED);

    @Autowired private EntityManager entityManager;
    @Autowired private ReservationRepository reservationRepository;

    @Test
    void claimBindsExactlyOneRecentReservationOwnedByTheMemberAtTheAdvertisedStore() {
        Member customer = member("customer@example.test");
        Member otherCustomer = member("other@example.test");
        Member owner = member("owner@example.test");
        Store advertisedStore = store(owner, "광고 가게");
        Store otherStore = store(owner, "다른 가게");

        Reservation eligible = reservation(customer, advertisedStore, Reservation.ReservationStatus.PENDING);
        Reservation foreignMember = reservation(otherCustomer, advertisedStore, Reservation.ReservationStatus.PENDING);
        Reservation foreignStore = reservation(customer, otherStore, Reservation.ReservationStatus.PENDING);
        Reservation stale = reservation(customer, advertisedStore, Reservation.ReservationStatus.PENDING);
        Reservation cancelled = reservation(customer, advertisedStore, Reservation.ReservationStatus.CANCELLED);
        entityManager.flush();

        LocalDateTime now = LocalDateTime.now();
        entityManager.createQuery("UPDATE Reservation r SET r.createdAt = :createdAt WHERE r.id = :id")
                .setParameter("createdAt", now.minusDays(2))
                .setParameter("id", stale.getId())
                .executeUpdate();
        entityManager.clear();

        Long adId = 88L;
        LocalDateTime cutoff = now.minusHours(24);
        assertThat(claim(eligible.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isEqualTo(1);
        assertThat(claim(eligible.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isZero();
        assertThat(claim(foreignMember.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isZero();
        assertThat(claim(foreignStore.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isZero();
        assertThat(claim(stale.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isZero();
        assertThat(claim(cancelled.getId(), customer.getId(), advertisedStore.getId(), adId, cutoff)).isZero();

        entityManager.flush();
        entityManager.clear();
        assertThat(reservationRepository.findById(eligible.getId()).orElseThrow().getAttributedAdId()).isEqualTo(adId);
    }

    private int claim(Long reservationId, Long memberId, Long storeId, Long adId, LocalDateTime cutoff) {
        return reservationRepository.claimAdvertisementConversion(
                reservationId, memberId, storeId, adId, cutoff, ELIGIBLE_STATUSES);
    }

    private Member member(String email) {
        Member member = Member.builder().name("검증 회원").email(email).role(Role.USER).build();
        entityManager.persist(member);
        return member;
    }

    private Store store(Member owner, String name) {
        Store store = Store.builder().name(name).owner(owner).build();
        entityManager.persist(store);
        return store;
    }

    private Reservation reservation(Member member, Store store, Reservation.ReservationStatus status) {
        Reservation reservation = Reservation.builder()
                .member(member)
                .store(store)
                .reservationDate(LocalDate.of(2030, 1, 1))
                .reservationTime(LocalTime.NOON)
                .guestCount(1)
                .status(status)
                .build();
        entityManager.persist(reservation);
        return reservation;
    }
}
