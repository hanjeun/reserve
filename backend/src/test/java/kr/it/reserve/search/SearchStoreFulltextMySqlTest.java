package kr.it.reserve.search;

import jakarta.persistence.EntityManager;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.search.StoreFulltextSearch;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/** DDL과 데이터는 실행 도구가 소유한 일회성 로컬 스키마에만 적용한다. */
@SpringBootTest
@Import(SearchStoreFulltextMySqlTest.QueryCaptureConfiguration.class)
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_LOGIN_TEST_ISOLATED", matches = "1")
class SearchStoreFulltextMySqlTest {
    private static final ThreadLocal<List<String>> SQL = ThreadLocal.withInitial(ArrayList::new);
    private static final String MATCH = "MATCH(store_name, description, address, category, keywords) AGAINST(? IN BOOLEAN MODE)";
    @Autowired SearchQueries queries;
    @Autowired StoreFulltextSearch fulltext;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    final List<Long> members = new ArrayList<>(), stores = new ArrayList<>();
    TransactionTemplate tx;
    Member owner;
    Statistics statistics;
    Object queryTarget, fulltextTarget;
    boolean statisticsWereEnabled;
    boolean ownedFixture;

    @DynamicPropertySource static void isolatedDatabase(DynamicPropertyRegistry properties) {
        SearchMySqlTest.isolatedDatabase(properties);
    }

    @BeforeEach void onlyOwnedFixture() {
        assertThat(jdbc.queryForObject("SELECT DATABASE()", String.class)).matches("reserve_release_login_[a-z0-9_]+");
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
        assertThat(jdbc.queryForObject("SELECT @@ngram_token_size", Integer.class)).isEqualTo(2);
        ownedFixture = true;
        dropIndex();
        tx = new TransactionTemplate(manager);
        tx.executeWithoutResult(status -> owner = member());
        statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statisticsWereEnabled = statistics.isStatisticsEnabled(); statistics.setStatisticsEnabled(true);
        queryTarget = AopTestUtils.getUltimateTargetObject(queries); fulltextTarget = AopTestUtils.getUltimateTargetObject(fulltext);
        ReflectionTestUtils.setField(fulltextTarget, "available", null);
        ReflectionTestUtils.setField(queryTarget, "fulltextEnabled", true);
    }

    @AfterEach void removeOnlyOwnedFixture() {
        if (!ownedFixture) return;
        dropIndex();
        tx.executeWithoutResult(status -> {
            delete("advertisement", "store_id", stores); delete("store", "store_id", stores); delete("member", "member_id", members);
        });
        ReflectionTestUtils.setField(fulltextTarget, "available", null);
        unified(false);
        statistics.setStatisticsEnabled(statisticsWereEnabled); SQL.remove();
    }

    @Test void defaultOffKeepsOneLiteralQueryAndOneConnectionEvenWithTheMatchingIndex() {
        correctIndex(); tx.executeWithoutResult(status -> store("사진 기본"));
        assertThat(ReflectionTestUtils.getField(queryTarget, "unifiedFulltextEnabled")).isEqualTo(false);
        var result = read("사진");
        assertThat(result.items()).hasSize(1); literalOnly(result);
        assertThat(ReflectionTestUtils.getField(fulltextTarget, "available")).isNull();
        unified(true);
        ReflectionTestUtils.setField(queryTarget, "fulltextEnabled", false);
        literalOnly(read("사진"));
        assertThat(ReflectionTestUtils.getField(fulltextTarget, "available")).isNull();
    }

    @Test void explicitOptInUsesNgramWithTheSamePublicWindowOrderingAndFourFieldProjection() {
        correctIndex(); Long[] first = new Long[1];
        tx.executeWithoutResult(status -> {
            Store promoted = store("사진 배지"); first[0] = promoted.getId();
            em.persist(Advertisement.builder().store(promoted).adType(AdType.BADGE).status(AdStatus.ACTIVE)
                    .startDate(ServiceTime.today()).endDate(ServiceTime.today().plusDays(1)).amount(0)
                    .merchantUid("synthetic-" + UUID.randomUUID()).build());
            for (int index = 0; index < 8; index++) store("사진 공개 " + index);
            store("사진 삭제").setDeletedAt(LocalDateTime.now());
            store("사진 제재").setStatus(StoreStatus.BANNED);
            Member banned = member(); banned.ban("synthetic"); store(banned, "사진 소유자 제재");
            Member deleted = member(); deleted.setDeletedAt(LocalDateTime.now()); store(deleted, "사진 소유자 탈퇴");
        });
        var literal = read("사진"); literalOnly(literal); unified(true);
        var indexed = read("사진");
        assertThat(indexed.items()).containsExactlyElementsOf(literal.items()).hasSize(6);
        assertThat(indexed.items().getFirst().id()).isEqualTo(first[0]);
        assertThat(indexed.sql()).hasSize(2).filteredOn(sql -> sql.contains("match(")).hasSize(2);
        assertThat(indexed.sql()).noneMatch(sql -> sql.contains("count("));
        assertThat(indexed.sql()).allSatisfy(sql -> assertThat(sql).doesNotContain("main_image_url", "detail_images", "password"));
        var plan = jdbc.queryForList("EXPLAIN SELECT store_id FROM store WHERE " + MATCH, fulltext.candidateQuery("사진"));
        assertThat(plan).anySatisfy(row -> {
            assertThat(row.get("type")).isEqualTo("fulltext"); assertThat(row.get("key")).isEqualTo("ft_store_search");
        });
    }

    @ParameterizedTest @ValueSource(strings = {"missing", "parser", "columns"})
    void absentOrIncompatibleIndexesUseOnlyTheOriginalLiteralQuery(String mode) {
        if (mode.equals("parser")) index("store_name, description, address, category, keywords", false);
        if (mode.equals("columns")) index("store_name, description, address, category", true);
        tx.executeWithoutResult(status -> store("사진 폴백")); unified(true);
        var result = read("사진");
        assertThat(result.items()).hasSize(1); literalOnly(result);
        assertThat(fulltext.candidateQuery("사진")).isEmpty();
    }

    @Test void shortSymbolsAndLiteralPhrasesRetainTheirMeaningWithOptInEnabled() {
        correctIndex();
        tx.executeWithoutResult(status -> {
            store("사진 -카페 100%_!"); store("사진 카페 100ZZ"); store("카페 사진"); store("김 @@()");
        });
        for (String keyword : List.of("사진 -카페", "사진 카페", "100%_!", "김", "@@()")) {
            unified(false); var literal = read(keyword); unified(true); var indexed = read(keyword);
            assertThat(indexed.items()).as(keyword).containsExactlyElementsOf(literal.items()).hasSize(1);
            if (keyword.equals("김") || keyword.equals("@@()")) literalOnly(indexed);
        }
    }

    @Test void stopwordCandidateLossReturnsTheCompleteLiteralWindowWithinTheSameSnapshot() {
        correctIndex(); tx.executeWithoutResult(status -> store("an 검색"));
        String candidate = fulltext.candidateQuery("an");
        assertThat(candidate).isEqualTo("+\"an\"");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM store WHERE " + MATCH, Long.class, candidate)).isZero();
        var literal = read("an"); unified(true); var indexed = read("an");
        assertThat(indexed.items()).containsExactlyElementsOf(literal.items()).hasSize(1);
        assertThat(indexed.sql()).hasSize(2);
        assertThat(indexed.sql().getLast()).doesNotContain("match(");
    }

    @Test void aRelatedMatchOutsideTheFirstWindowStillForcesCompleteLiteralFallback() {
        correctIndex(); tx.executeWithoutResult(status -> {
            store("도자기 오래된 관련 결과");
            for (int i = 0; i < 8; i++) store("도예 " + i);
        });
        var literal = read("도예"); unified(true); var indexed = read("도예");
        assertThat(indexed.items()).containsExactlyElementsOf(literal.items());
        assertThat(indexed.sql()).hasSize(2).noneMatch(sql -> sql.contains("count("));
        assertThat(indexed.sql().getFirst()).contains("match(", "coalesce(");
        assertThat(indexed.sql().getLast()).doesNotContain("match(");
    }

    @Test void droppingTheCachedIndexEndsTheFailedMatchBeforeLiteralFallbackAndDisablesRetries() {
        correctIndex(); tx.executeWithoutResult(status -> store("사진 제거"));
        var literal = read("사진");
        assertThat(fulltext.candidateQuery("사진")).isEqualTo("+\"사진\""); dropIndex(); unified(true);
        var recovered = read("사진");
        assertThat(recovered.items()).containsExactlyElementsOf(literal.items());
        assertThat(recovered.sql()).hasSize(2).anyMatch(sql -> sql.contains("match("));
        assertThat(fulltext.candidateQuery("사진")).isEmpty();
        literalOnly(read("사진"));
    }

    @Test void comparesBoundedRealQueriesAndNgramPlanOnOneSyntheticDataset() {
        correctIndex(); tx.executeWithoutResult(status -> { store("사진"); for (int i = 0; i < 240; i++) store("사진 공개 " + i); });
        unified(false); var literal = read("사진"); literalOnly(literal);
        unified(true); var indexed = read("사진");
        assertThat(indexed.items()).containsExactlyElementsOf(literal.items()).hasSize(6);
        assertThat(indexed.sql()).hasSize(2); assertThat(indexed.connections()).isLessThanOrEqualTo(2);
        long[] literalTimes = new long[9], indexedTimes = new long[9];
        long[] examined = new long[2];
        boolean measureRows = "true".equals(System.getenv("RESERVE_SEARCH_COST_TEST"));
        for (int i = 0; i < 9; i++) {
            unified(false); long before = measureRows ? rowsExamined() : 0;
            long start = System.nanoTime(); read("사진"); literalTimes[i] = System.nanoTime() - start;
            if (measureRows) examined[0] += rowsExamined() - before;
            unified(true); before = measureRows ? rowsExamined() : 0;
            start = System.nanoTime(); read("사진"); indexedTimes[i] = System.nanoTime() - start;
            if (measureRows) examined[1] += rowsExamined() - before;
        }
        java.util.Arrays.sort(literalTimes); java.util.Arrays.sort(indexedTimes);
        var plan = jdbc.queryForList("EXPLAIN SELECT store_id FROM store WHERE deleted_at IS NULL AND " + MATCH, fulltext.candidateQuery("사진"));
        assertThat(plan).anySatisfy(row -> assertThat(row.get("type")).isEqualTo("fulltext"));
        var analyzed = jdbc.queryForObject("EXPLAIN ANALYZE SELECT store_id FROM store WHERE deleted_at IS NULL AND " + MATCH + " LIMIT 6", String.class, fulltext.candidateQuery("사진"));
        assertThat(analyzed).contains("actual time", "rows=");
        System.out.printf(java.util.Locale.ROOT, "Synthetic search: rows=241 samples=9 literalP95Ms=%.3f fulltextP95Ms=%.3f literalQueries=1 fulltextQueries=2 literalConnections=%d fulltextConnections=%d%n",
                literalTimes[8] / 1_000_000.0, indexedTimes[8] / 1_000_000.0, literal.connections(), indexed.connections());
        System.out.println("Synthetic ngram plan: " + analyzed.replaceAll("[\r\n]+", " "));
        if (measureRows) {
            assertThat(examined[0]).isPositive(); assertThat(examined[1]).isPositive();
            System.out.printf("Synthetic search rows examined: samples=9 literalTotal=%d fulltextTotal=%d%n", examined[0], examined[1]);
        }
    }
    private long rowsExamined() {
        return jdbc.queryForObject("SELECT COALESCE(SUM(SUM_ROWS_EXAMINED),0) FROM performance_schema.events_statements_summary_by_digest "
                + "WHERE SCHEMA_NAME=DATABASE() AND DIGEST_TEXT LIKE 'SELECT%' AND DIGEST_TEXT LIKE '%`store`%'", Long.class);
    }
    private Measured read(String keyword) {
        SQL.get().clear(); long connections = statistics.getConnectCount();
        var result = queries.stores(SearchQuery.from(keyword, 5));
        return new Measured(result, List.copyOf(SQL.get()), statistics.getConnectCount() - connections);
    }
    private void literalOnly(Measured result) {
        assertThat(result.sql()).hasSize(1).allSatisfy(sql -> assertThat(sql).doesNotContain("match(", "count("));
        assertThat(result.connections()).isEqualTo(1);
    }
    private void unified(boolean enabled) {
        ReflectionTestUtils.setField(queryTarget, "unifiedFulltextEnabled", enabled);
    }
    private Member member() {
        var row = Member.builder().name("synthetic").email("fulltext-" + UUID.randomUUID() + "@example.test")
                .password("synthetic").provider(AuthProvider.LOCAL).role(Role.BUSINESS).termsAgreed(true).build();
        em.persist(row); members.add(row.getId()); return row;
    }
    private Store store(String name) { return store(owner, name); }
    private Store store(Member member, String name) {
        var row = Store.builder().owner(member).name(name).description(name).category("스튜디오").address("서울")
                .mainImageUrl("https://synthetic.invalid/private-image-marker").build();
        em.persist(row); stores.add(row.getId()); return row;
    }
    private void correctIndex() { index("store_name, description, address, category, keywords", true); }
    private void index(String columns, boolean ngram) {
        // 기존 다섯 컬럼 색인 계약을 재사용하며 이 일회성 스키마만 변경한다.
        jdbc.execute("ALTER TABLE store ADD FULLTEXT INDEX ft_store_search (" + columns + ")" + (ngram ? " WITH PARSER ngram" : ""));
    }
    private void dropIndex() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() "
                + "AND table_name = 'store' AND index_name = 'ft_store_search'", Integer.class);
        if (count != null && count > 0) jdbc.execute("ALTER TABLE store DROP INDEX ft_store_search");
    }
    private void delete(String table, String column, List<Long> ids) {
        if (!ids.isEmpty()) jdbc.update("DELETE FROM " + table + " WHERE " + column + " IN ("
                + String.join(",", Collections.nCopies(ids.size(), "?")) + ")", ids.toArray());
    }
    record Measured(List<SearchResponse.Item> items, List<String> sql, long connections) {}
    @TestConfiguration(proxyBeanMethods = false)
    static class QueryCaptureConfiguration {
        @Bean HibernatePropertiesCustomizer captureSearchQueries() {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", (StatementInspector) statement -> {
                SQL.get().add(statement.toLowerCase(Locale.ROOT)); return statement;
            });
        }
    }
}
