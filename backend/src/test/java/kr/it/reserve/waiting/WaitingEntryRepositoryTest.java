package kr.it.reserve.waiting;

import jakarta.persistence.EntityManager;
import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@ActiveProfiles("test")
@ContextConfiguration(classes = WaitingEntryRepositoryTest.Config.class)
class WaitingEntryRepositoryTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = WaitingEntry.class)
    @EnableJpaRepositories(basePackageClasses = WaitingEntryRepository.class)
    static class Config {
    }

    private static final LocalDate DAY = LocalDate.of(2026, 10, 5);
    private static final LocalDateTime START = LocalDateTime.parse("2026-10-04T15:00:00");
    @Autowired WaitingEntryRepository entries;
    @Autowired EntityManager entityManager;

    @Test
    void boardIncludesOldActiveAndTodaysCompletionsButExcludesOtherStoresAndPreviousCompletions() {
        WaitingEntry active = save(31L, 1, DAY.minusDays(9), null, null);
        WaitingEntry called = save(31L, 2, DAY.minusDays(8), WaitingStatus.CALLED, START.minusDays(8));
        WaitingEntry completed = save(31L, 3, DAY.minusDays(1), WaitingStatus.SEATED, START.plusMinutes(2));
        save(31L, 4, DAY.minusDays(1), WaitingStatus.CANCELLED, START.minusMinutes(1));
        save(32L, 1, DAY, null, null);
        entries.flush();

        assertThat(entries.findBoard(31L, WaitingStatus.ACTIVE, WaitingStatus.TERMINAL, START, START.plusDays(1)))
                .extracting(WaitingEntry::getId).containsExactly(active.getId(), called.getId(), completed.getId());
        assertThat(entries.lastEntryNumber(31L, DAY)).isZero();
        assertThat(entries.lastEntryNumber(31L, DAY.minusDays(1))).isEqualTo(4);
    }

    @Test
    void sweepDoesNotTouchActiveNamesOrRowsAndKeepsTodaysCompletionName() {
        WaitingEntry active = save(31L, 1, DAY.minusDays(100), null, null);
        WaitingEntry old = save(31L, 2, DAY.minusDays(9), WaitingStatus.CANCELLED, START.minusDays(8));
        WaitingEntry yesterday = save(31L, 3, DAY.minusDays(1), WaitingStatus.SEATED, START.minusMinutes(1));
        WaitingEntry today = save(31L, 4, DAY.minusDays(1), WaitingStatus.CANCELLED, START.plusMinutes(1));
        entries.flush();

        assertThat(entries.clearFinishedNames(WaitingStatus.TERMINAL, START, true)).isEqualTo(2);
        assertThat(entries.deleteFinishedBefore(WaitingStatus.TERMINAL, START.minusDays(7), true)).isEqualTo(1);
        assertThat(entries.findById(old.getId())).isEmpty();
        assertThat(entries.findById(active.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
        assertThat(entries.findById(yesterday.getId()).orElseThrow().getDisplayName()).isNull();
        assertThat(entries.findById(today.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
    }

    @Test
    void deletedOrMissingStoreCancelsOnlyActiveTeamsWithoutOverwritingCompletedRows() {
        // 삭제 경계와 개인 목록 검색이 참조하는 Store 컬럼만 독립 H2 fixture로 둔다.
        entityManager.createNativeQuery("CREATE TABLE IF NOT EXISTS store (store_id BIGINT PRIMARY KEY, deleted_at TIMESTAMP NULL, store_name VARCHAR(255))")
                .executeUpdate();
        entityManager.createNativeQuery("INSERT INTO store (store_id, deleted_at) VALUES (31, NULL), (32, '2026-10-04 15:00:00')")
                .executeUpdate();
        WaitingEntry active = save(31L, 1, DAY.minusDays(100), null, null);
        WaitingEntry closed = save(32L, 1, DAY.minusDays(1), WaitingStatus.CALLED, START.minusMinutes(2));
        WaitingEntry missing = save(33L, 1, DAY.minusDays(1), null, null);
        WaitingEntry alreadySeated = save(32L, 2, DAY.minusDays(1), WaitingStatus.SEATED, START.plusMinutes(1));
        entries.flush();
        LocalDateTime now = START.plusMinutes(5);

        assertThat(entries.cancelForDeletedStores(Set.of("WAITING", "CALLED"), "CANCELLED", now, true)).isEqualTo(2);
        for (Long id : new Long[]{closed.getId(), missing.getId()}) {
            WaitingEntry cancelled = entries.findById(id).orElseThrow();
            assertThat(cancelled.getStatus()).isEqualTo(WaitingStatus.CANCELLED);
            assertThat(cancelled.getDisplayName()).isNull();
            assertThat(cancelled.getFinishedAt()).isEqualTo(now);
        }
        assertThat(entries.findById(active.getId()).orElseThrow().getStatus()).isEqualTo(WaitingStatus.WAITING);
        assertThat(entries.findById(active.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
        assertThat(entries.findById(alreadySeated.getId()).orElseThrow().getStatus()).isEqualTo(WaitingStatus.SEATED);
        assertThat(entries.findById(alreadySeated.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
        assertThat(entries.cancelForDeletedStores(Set.of("WAITING", "CALLED"), "CANCELLED", now.plusMinutes(5), true)).isZero();
    }

    private WaitingEntry save(Long storeId, int number, LocalDate day, WaitingStatus status, LocalDateTime finished) {
        WaitingEntry entry = WaitingEntry.create(storeId, day, number, "테스트 팀", 2, "request-" + storeId + "-" + number, START.minusDays(100));
        if (status == WaitingStatus.SEATED || status == WaitingStatus.CALLED) entry.changeStatus(WaitingStatus.CALLED, finished);
        if (status != null && status != WaitingStatus.CALLED) entry.changeStatus(status, finished);
        return entries.save(entry);
    }

    @Test
    void customerQueriesAreScopedAndWithdrawalRemovesIdentityWithoutOverwritingCompletedStatus() {
        WaitingEntry active = entries.save(WaitingEntry.createForCustomer(31L, DAY, 1, "손님", 2, "customer-1", START, 7L,
                kr.it.reserve.waiting.entity.WaitingSource.REMOTE, START.minusDays(1)));
        WaitingEntry seated = entries.save(WaitingEntry.createForCustomer(31L, DAY, 2, "손님", 2, "customer-2", START, 7L,
                kr.it.reserve.waiting.entity.WaitingSource.ONSITE, START.minusDays(1)));
        seated.changeStatus(WaitingStatus.CALLED, START.plusMinutes(1)); seated.changeStatus(WaitingStatus.SEATED, START.plusMinutes(2));
        save(31L, 3, DAY, null, null); entries.flush();
        assertThat(entries.findPersonal(7L, WaitingStatus.ACTIVE, START, org.springframework.data.domain.PageRequest.of(0, 20)))
                .extracting(WaitingEntry::getId).containsExactly(seated.getId(), active.getId());
        assertThat(entries.findPersonal(8L, WaitingStatus.ACTIVE, START, org.springframework.data.domain.PageRequest.of(0, 20))).isEmpty();
        assertThat(entries.teamsAhead(31L, WaitingStatus.ACTIVE, DAY, 3)).isEqualTo(1);
        assertThat(entries.activeMemberIds(31L, WaitingStatus.ACTIVE)).containsExactly(7L);
        entries.anonymizeMember(7L, WaitingStatus.ACTIVE, WaitingStatus.CANCELLED, START.plusMinutes(3)); entityManager.clear();
        assertThat(entries.findById(active.getId()).orElseThrow().getStatus()).isEqualTo(WaitingStatus.CANCELLED);
        assertThat(entries.findById(seated.getId()).orElseThrow().getStatus()).isEqualTo(WaitingStatus.SEATED);
        assertThat(entries.findById(seated.getId()).orElseThrow().getMemberId()).isNull();
        assertThat(entries.findById(active.getId()).orElseThrow().getDisplayName()).isNull();
    }

    @Test
    void customerSweepRequiresItsOwnPublicationAndKeepsLegacyUnnotifiedCustomerRows() {
        WaitingEntry staff = save(31L, 1, DAY.minusDays(9), WaitingStatus.CANCELLED, START.minusDays(8));
        WaitingEntry customer = WaitingEntry.createForCustomer(31L, DAY.minusDays(9), 2, "손님", 2, "customer-old", START.minusDays(9),
                7L, kr.it.reserve.waiting.entity.WaitingSource.REMOTE, START.minusDays(10));
        customer.changeStatus(WaitingStatus.CANCELLED, START.minusDays(8)); entries.save(customer);
        WaitingEntry legacy = WaitingEntry.createForCustomer(31L, DAY.minusDays(9), 3, "기존 손님", 2, "customer-unnotified", START.minusDays(9),
                8L, kr.it.reserve.waiting.entity.WaitingSource.ONSITE, null);
        legacy.changeStatus(WaitingStatus.CANCELLED, START.minusDays(8)); entries.saveAndFlush(legacy);

        assertThat(entries.clearFinishedNames(WaitingStatus.TERMINAL, START, false)).isEqualTo(1);
        assertThat(entries.deleteFinishedBefore(WaitingStatus.TERMINAL, START.minusDays(7), false)).isEqualTo(1);
        assertThat(entries.findById(staff.getId())).isEmpty();
        assertThat(entries.findById(customer.getId()).orElseThrow().getDisplayName()).isEqualTo("손님");
        assertThat(entries.clearFinishedNames(WaitingStatus.TERMINAL, START, true)).isEqualTo(1);
        assertThat(entries.deleteFinishedBefore(WaitingStatus.TERMINAL, START.minusDays(7), true)).isEqualTo(1);
        assertThat(entries.findById(legacy.getId()).orElseThrow().getDisplayName()).isEqualTo("기존 손님");
    }

    @Test
    void personalFiltersApplyBeforePaginationAndKeepOnlyOwnActiveOrTodaysFinishedEntries() {
        personalStores();
        List<WaitingEntry> waiting = new ArrayList<>();
        for (int number = 1; number <= 25; number++) {
            waiting.add(personal(31L, 7L, number, WaitingStatus.WAITING, START, null));
        }
        WaitingEntry oldActive = personal(31L, 7L, 40, WaitingStatus.WAITING, START.minusDays(9), null);
        WaitingEntry called = personal(31L, 7L, 41, WaitingStatus.CALLED, START.minusDays(8), START.minusDays(8));
        WaitingEntry seated = personal(31L, 7L, 42, WaitingStatus.SEATED, START.minusDays(1), START);
        personal(31L, 7L, 43, WaitingStatus.CANCELLED, START.minusDays(1), START.minusSeconds(1));
        personal(31L, 8L, 44, WaitingStatus.WAITING, START, null);
        save(31L, 45, DAY, null, null);
        entries.flush();

        var first = entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "WAITING", "%가게%", "recent", PageRequest.of(0, 20));
        assertThat(first.getTotalElements()).isEqualTo(26);
        assertThat(first.getContent()).extracting(WaitingEntry::getId)
                .containsExactlyElementsOf(waiting.reversed().subList(0, 20).stream().map(WaitingEntry::getId).toList());
        var second = entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "WAITING", "%가게%", "recent", PageRequest.of(1, 20));
        assertThat(second.getTotalElements()).isEqualTo(26);
        assertThat(second.getContent()).hasSize(6).last().extracting(WaitingEntry::getId).isEqualTo(oldActive.getId());
        var oldest = entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "WAITING", "", "oldest", PageRequest.of(0, 20));
        assertThat(oldest.getContent()).extracting(WaitingEntry::getId)
                .containsExactlyElementsOf(java.util.stream.Stream.concat(java.util.stream.Stream.of(oldActive), waiting.stream().limit(19))
                        .map(WaitingEntry::getId).toList());
        assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "ALL", "", "recent", PageRequest.of(0, 100)).getTotalElements()).isEqualTo(28);
        assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "CALLED", "", "recent", PageRequest.of(0, 20)))
                .extracting(WaitingEntry::getId).containsExactly(called.getId());
        assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "SEATED", "", "recent", PageRequest.of(0, 20)))
                .extracting(WaitingEntry::getId).containsExactly(seated.getId());
    }

    @Test
    void personalSearchTreatsWildcardCharactersLiterallyAndCanFindNumbersWithoutAStore() {
        personalStores();
        personal(31L, 7L, 101, WaitingStatus.WAITING, START, null);
        WaitingEntry literal = personal(32L, 7L, 202, WaitingStatus.WAITING, START, null);
        personal(32L, 8L, 303, WaitingStatus.WAITING, START, null);
        personal(32L, 7L, 404, WaitingStatus.CANCELLED, START.minusDays(1), START.minusSeconds(1));
        WaitingEntry missingStore = personal(33L, 7L, 909, WaitingStatus.WAITING, START, null);
        entries.flush();

        for (String pattern : List.of("%100!%!_!!%", "%202%")) {
            assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "ALL", pattern, "recent", PageRequest.of(0, 20)))
                    .extracting(WaitingEntry::getId).containsExactly(literal.getId());
        }
        for (String pattern : List.of("%303%", "%404%")) {
            assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "ALL", pattern, "recent", PageRequest.of(0, 20))).isEmpty();
        }
        assertThat(entries.findPersonalFiltered(7L, Set.of("WAITING", "CALLED"), START, "ALL", "%909%", "recent", PageRequest.of(0, 20)))
                .extracting(WaitingEntry::getId).containsExactly(missingStore.getId());
    }

    private void personalStores() {
        entityManager.createNativeQuery("CREATE TABLE IF NOT EXISTS store (store_id BIGINT PRIMARY KEY, deleted_at TIMESTAMP NULL, store_name VARCHAR(255))").executeUpdate();
        entityManager.createNativeQuery("INSERT INTO store (store_id, deleted_at, store_name) VALUES (31, NULL, '100xY!가게'), (32, NULL, '100%_!가게')").executeUpdate();
    }

    private WaitingEntry personal(Long storeId, Long memberId, int number, WaitingStatus status, LocalDateTime created, LocalDateTime finished) {
        WaitingEntry entry = WaitingEntry.createForCustomer(storeId, DAY, number, "손님", 2, "personal-" + storeId + "-" + number,
                created, memberId, kr.it.reserve.waiting.entity.WaitingSource.REMOTE, START.minusDays(1));
        if (status == WaitingStatus.CALLED || status == WaitingStatus.SEATED) entry.changeStatus(WaitingStatus.CALLED, finished);
        if (status.isTerminal()) entry.changeStatus(status, finished);
        return entries.save(entry);
    }
}
