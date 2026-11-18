package kr.it.reserve.payment.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 폐기 가능한 loopback 합성 DB만 허용하고 MySQL RR의 실제 현재 읽기를 확인한다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_FINANCIAL_TEST_ISOLATED", matches = "1")
class CurrentLockedStateMySqlTest extends CurrentLockedStatePersistenceTest {
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_FINANCIAL_TEST_URL");
        String user = required("RESERVE_MYSQL_FINANCIAL_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_financial_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_financial_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("Financial tests require a disposable loopback database and a dedicated account");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_FINANCIAL_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.maximum-pool-size", () -> "4");
        properties.add("spring.datasource.hikari.minimum-idle", () -> "0");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 10");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test
    void fixtureUsesMySqlRepeatableRead() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated financial fixture input: " + key);
        return value;
    }
}
