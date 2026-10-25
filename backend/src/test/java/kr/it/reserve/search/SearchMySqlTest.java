package kr.it.reserve.search;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 실행 도구의 일회성 로그인 DB와 전용 계정만 사용한다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_LOGIN_TEST_ISOLATED", matches = "1")
class SearchMySqlTest extends SearchPersistenceTest {
    @DynamicPropertySource static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_LOGIN_TEST_URL"), user = required("RESERVE_MYSQL_LOGIN_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_login_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_login_test[a-z0-9_]*"))
            throw new IllegalArgumentException("Search checks require a disposable loopback database and dedicated account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_LOGIN_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }
    @Test void checksRunOnTheRequiredMySqlEngine() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
    }
    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated search fixture input: " + name);
        return value;
    }
}
