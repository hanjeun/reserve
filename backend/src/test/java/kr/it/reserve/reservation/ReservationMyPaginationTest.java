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
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ReservationMyPaginationTest {
    @Autowired EntityManager entityManager;
    @Autowired ReservationRepository repository;

    @Test
    void allOwnedRowsAreReachableWithStablePageOrderAndServerSideSort() {
        Member customer = member("page-customer@example.test");
        Store store = store(customer, "내 예약 가게");
        List<Long> expected = new ArrayList<>();
        for (int i = 0; i < 101; i++) expected.add(reservation(customer, store).getId());
        entityManager.flush();
        entityManager.createQuery("UPDATE Reservation r SET r.createdAt = :at WHERE r.member = :member")
                .setParameter("at", LocalDateTime.of(2026, 1, 1, 0, 0)).setParameter("member", customer).executeUpdate();
        entityManager.clear();

        List<Long> actual = new ArrayList<>();
        for (int page = 0; page < 7; page++) {
            var result = repository.searchForMember(customer, "", null,
                    PageRequest.of(page, 15, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
            assertThat(result.getTotalElements()).isEqualTo(101);
            actual.addAll(result.map(Reservation::getId).getContent());
        }
        assertThat(actual).containsExactlyElementsOf(expected.reversed()).doesNotHaveDuplicates();
        assertThat(repository.searchForMember(customer, "", null,
                PageRequest.of(0, 15, Sort.by(Sort.Direction.ASC, "createdAt", "id"))).map(Reservation::getId))
                .containsExactlyElementsOf(expected.subList(0, 15));
    }

    @Test
    void memberStatusSearchAndHiddenRowsAreFilteredBeforeContentAndCount() {
        Member customer = member("filter-customer@example.test");
        Member other = member("other-customer@example.test");
        Store store = store(customer, "예약 검색 가게");
        for (int i = 0; i < 20; i++) reservation(customer, store);
        Reservation matched = reservation(customer, store);
        matched.setSpecialRequest("창가 100%_! 자리");
        matched.setReservationCode("R-SEARCH-ONE");
        Reservation otherMember = reservation(other, store);
        otherMember.setSpecialRequest("창가 100%_! 자리");
        Reservation cancelled = reservation(customer, store);
        cancelled.setSpecialRequest("창가 100%_! 자리");
        cancelled.setStatus(Reservation.ReservationStatus.CANCELLED);
        Reservation hidden = reservation(customer, store);
        hidden.setSpecialRequest("창가 100%_! 자리");
        hidden.setDeletedAt(LocalDateTime.now());
        entityManager.flush();
        entityManager.clear();

        var result = repository.searchForMember(customer, "100!%!_!!", Reservation.ReservationStatus.PENDING, PageRequest.of(0, 15));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.map(Reservation::getId)).containsExactly(matched.getId());
        assertThat(repository.searchForMember(customer, "r-search-one", null, PageRequest.of(0, 15))
                .map(Reservation::getId)).containsExactly(matched.getId());
        assertThat(repository.searchForMember(customer, "검색 가게", Reservation.ReservationStatus.CANCELLED, PageRequest.of(0, 15))
                .map(Reservation::getId)).containsExactly(cancelled.getId());
        assertThat(repository.searchForMember(other, "r-search-one", null, PageRequest.of(0, 15))).isEmpty();
    }

    private Member member(String email) {
        Member member = Member.builder().name("검토용").email(email).role(Role.USER).build();
        entityManager.persist(member);
        return member;
    }

    private Store store(Member owner, String name) {
        Store store = Store.builder().name(name).owner(owner).build();
        entityManager.persist(store);
        return store;
    }

    private Reservation reservation(Member member, Store store) {
        Reservation row = Reservation.builder().member(member).store(store).reservationDate(LocalDate.of(2030, 1, 1))
                .reservationTime(LocalTime.NOON).guestCount(1).status(Reservation.ReservationStatus.PENDING).build();
        entityManager.persist(row);
        return row;
    }
}
