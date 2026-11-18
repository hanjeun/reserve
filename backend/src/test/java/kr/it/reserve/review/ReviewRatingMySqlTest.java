package kr.it.reserve.review;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 새로 만든 loopback 합성 DB에서만 MySQL의 잠금과 RR snapshot을 검증한다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_REVIEW_TEST_ISOLATED", matches = "1")
class ReviewRatingMySqlTest extends ReviewRatingPersistenceTest {
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_REVIEW_TEST_URL");
        String user = required("RESERVE_MYSQL_REVIEW_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_review_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_review_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("Review tests require a disposable loopback database and a dedicated account");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_REVIEW_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.maximum-pool-size", () -> "4");
        properties.add("spring.datasource.hikari.minimum-idle", () -> "0");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 10");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test
    void fixtureUsesMySqlAndItsDefaultRepeatableRead() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated review fixture input: " + key);
        return value;
    }
}
