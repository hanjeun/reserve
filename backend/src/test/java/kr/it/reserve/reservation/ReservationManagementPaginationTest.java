package kr.it.reserve.reservation;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
class ReservationManagementPaginationTest {
    @Autowired private EntityManager entityManager;
    @Autowired private ReservationRepository repository;
    @Autowired private kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository issues;

    @ParameterizedTest
    @ValueSource(ints = {101, 201})
    void everyOwnedReservationIsReachableWithStableOrder(int count) {
        Fixture fixture = fixture(count);
        List<Long> actual = new ArrayList<>();
        for (int page = 0; page * 15 < count; page++) {
            var result = repository.searchForStoreOwner(fixture.owner(), "", null, null,
                    PageRequest.of(page, 15, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
            assertThat(result.getTotalElements()).isEqualTo(count);
            actual.addAll(result.map(Reservation::getId).getContent());
        }
        assertThat(actual).hasSize(count).doesNotHaveDuplicates()
                .isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @Test
    void managementQueryHonorsRequestedSortInsteadOfHardCodingRecentOrder() {
        Fixture fixture = fixture(3);
        var recent = repository.searchForStoreOwner(fixture.owner(), "", null, null,
                PageRequest.of(0, 15, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        var oldest = repository.searchForStoreOwner(fixture.owner(), "", null, null,
                PageRequest.of(0, 15, Sort.by(Sort.Direction.ASC, "createdAt", "id")));

        assertThat(recent.getContent()).extracting(Reservation::getId)
                .containsExactlyElementsOf(oldest.getContent().stream().map(Reservation::getId).toList().reversed());
    }

    @Test
    void storeStatusAndSpecialRequestFilterApplyBeforePagingWithoutOwnerLeak() {
        Fixture fixture = fixture(101);
        var result = repository.searchForStoreOwner(fixture.owner(), "창가검토", Reservation.ReservationStatus.PENDING,
                fixture.secondStore().getId(), PageRequest.of(0, 15));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).extracting(Reservation::getSpecialRequest).containsExactly("창가검토");
        assertThat(repository.searchForStoreOwner(fixture.otherOwner(), "창가검토", null,
                fixture.secondStore().getId(), PageRequest.of(0, 15))).isEmpty();
    }

    @Test
    void adminCountUsesTheSameStoreAndSearchFilterAsContent() {
        Fixture fixture = fixture(101);
        var result = repository.searchForAdmin("창가검토", null, fixture.secondStore().getId(), PageRequest.of(0, 15));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).hasSize(1);
    }

    @Test
    void expiredPersonalFieldsCannotBeUsedAsAManagementSearchOracle() {
        Fixture fixture = fixture(1);
        Reservation expired = repository.searchForStoreOwner(fixture.owner(), "", null, null, PageRequest.of(0, 20)).getContent().getFirst();
        expired.setUsageEndsAt(kr.it.reserve.global.common.ServiceTime.now().minusDays(31));
        expired.setReservationDate(kr.it.reserve.global.common.ServiceTime.today().minusDays(31));
        expired.setReservationCode("SYNTHETIC-CODE");
        entityManager.flush(); entityManager.clear();
        for (String keyword : List.of("customer@example.test", "검토용", "창가검토")) {
            assertThat(repository.searchForStoreOwner(fixture.owner(), keyword, null, null, PageRequest.of(0, 20))).isEmpty();
            assertThat(repository.searchForAdmin(keyword, null, null, PageRequest.of(0, 20))).isEmpty();
        }
        assertThat(repository.searchForStoreOwner(fixture.owner(), "SYNTHETIC-CODE", null, null, PageRequest.of(0, 20)).getTotalElements()).isEqualTo(1);
        assertThat(repository.searchForAdmin("SYNTHETIC-CODE", null, null, PageRequest.of(0, 20)).getTotalElements()).isEqualTo(1);
    }

    @Test
    void orderOnlyReconciliationStillProtectsTheLinkedReservation() {
        Fixture fixture = fixture(1);
        Reservation reservation = repository.searchForStoreOwner(fixture.owner(), "", null, null, PageRequest.of(0,20)).getContent().getFirst();
        entityManager.persist(kr.it.reserve.payment.entity.Payment.builder().reservation(reservation).member(reservation.getMember())
                .amount(1000).status(kr.it.reserve.payment.entity.Payment.PaymentStatus.REFUNDED).merchantUid("synthetic-issue-order").build());
        var issue = kr.it.reserve.payment.entity.PaymentReconciliationIssue.open("SYNTHETIC:ORDER",
                kr.it.reserve.payment.entity.PaymentReconciliationIssue.IssueType.PAID_STATE_CONFLICT,
                null,null,"synthetic-issue-order","SYNTHETIC",LocalDateTime.now());
        entityManager.persist(issue); entityManager.flush();
        assertThat(issues.existsOpenForReservation(reservation.getId())).isTrue();
        issue.resolve(LocalDateTime.now()); entityManager.flush();
        assertThat(issues.existsOpenForReservation(reservation.getId())).isFalse();
    }

    private Fixture fixture(int count) {
        Member owner = member("owner@example.test", Role.BUSINESS);
        Member otherOwner = member("other@example.test", Role.BUSINESS);
        Member customer = member("customer@example.test", Role.USER);
        Store first = store(owner, "첫 가게");
        Store second = store(owner, "둘째 가게");
        for (int i = 0; i < count; i++) {
            Reservation reservation = Reservation.builder()
                    .store(i == 0 ? second : first).member(customer)
                    .reservationDate(LocalDate.of(2030, 1, 1)).reservationTime(LocalTime.NOON)
                    .guestCount(1).status(i == 0 ? Reservation.ReservationStatus.PENDING : Reservation.ReservationStatus.CONFIRMED)
                    .specialRequest(i == 0 ? "창가검토" : null).build();
            entityManager.persist(reservation);
        }
        entityManager.flush();
        // 동일 생성 시각에서도 페이지 간 중복·누락이 없는지 ID 보조 정렬을 검증한다.
        entityManager.createQuery("UPDATE Reservation r SET r.createdAt = :at WHERE r.member = :member")
                .setParameter("at", LocalDateTime.of(2026, 1, 1, 0, 0)).setParameter("member", customer).executeUpdate();
        entityManager.clear();
        return new Fixture(owner, otherOwner, second);
    }

    private Member member(String email, Role role) {
        Member member = Member.builder().name("검토용").email(email).role(role).build();
        entityManager.persist(member);
        return member;
    }

    private Store store(Member owner, String name) {
        Store store = Store.builder().name(name).owner(owner).build();
        entityManager.persist(store);
        return store;
    }

    private record Fixture(Member owner, Member otherOwner, Store secondStore) { }
}
