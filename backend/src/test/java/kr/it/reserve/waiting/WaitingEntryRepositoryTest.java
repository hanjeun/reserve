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
import java.util.Set;

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

        assertThat(entries.clearFinishedNames(WaitingStatus.TERMINAL, START)).isEqualTo(2);
        assertThat(entries.deleteFinishedBefore(WaitingStatus.TERMINAL, START.minusDays(7))).isEqualTo(1);
        assertThat(entries.findById(old.getId())).isEmpty();
        assertThat(entries.findById(active.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
        assertThat(entries.findById(yesterday.getId()).orElseThrow().getDisplayName()).isNull();
        assertThat(entries.findById(today.getId()).orElseThrow().getDisplayName()).isEqualTo("테스트 팀");
    }

    @Test
    void deletedOrMissingStoreCancelsOnlyActiveTeamsWithoutOverwritingCompletedRows() {
        // 이 native 쿼리가 참조하는 실제 Store 컬럼 두 개만 독립 H2 fixture로 둔다.
        entityManager.createNativeQuery("CREATE TABLE IF NOT EXISTS store (store_id BIGINT PRIMARY KEY, deleted_at TIMESTAMP NULL)")
                .executeUpdate();
        entityManager.createNativeQuery("INSERT INTO store VALUES (31, NULL), (32, '2026-10-04 15:00:00')")
                .executeUpdate();
        WaitingEntry active = save(31L, 1, DAY.minusDays(100), null, null);
        WaitingEntry closed = save(32L, 1, DAY.minusDays(1), WaitingStatus.CALLED, START.minusMinutes(2));
        WaitingEntry missing = save(33L, 1, DAY.minusDays(1), null, null);
        WaitingEntry alreadySeated = save(32L, 2, DAY.minusDays(1), WaitingStatus.SEATED, START.plusMinutes(1));
        entries.flush();
        LocalDateTime now = START.plusMinutes(5);

        assertThat(entries.cancelForDeletedStores(Set.of("WAITING", "CALLED"), "CANCELLED", now)).isEqualTo(2);
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
        assertThat(entries.cancelForDeletedStores(Set.of("WAITING", "CALLED"), "CANCELLED", now.plusMinutes(5))).isZero();
    }

    private WaitingEntry save(Long storeId, int number, LocalDate day, WaitingStatus status, LocalDateTime finished) {
        WaitingEntry entry = WaitingEntry.create(storeId, day, number, "테스트 팀", 2, "request-" + storeId + "-" + number, START.minusDays(100));
        if (status == WaitingStatus.SEATED || status == WaitingStatus.CALLED) entry.changeStatus(WaitingStatus.CALLED, finished);
        if (status != null && status != WaitingStatus.CALLED) entry.changeStatus(status, finished);
        return entries.save(entry);
    }
}
