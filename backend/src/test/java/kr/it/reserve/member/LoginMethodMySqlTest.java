package kr.it.reserve.member;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 별도 합성 데이터베이스에서만 실행한다. 기존 개발·복원·운영 DB는 허용하지 않는다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_LOGIN_TEST_ISOLATED", matches = "1")
class LoginMethodMySqlTest extends LoginMethodPersistenceTest {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManagerFactory factory;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_LOGIN_TEST_URL");
        String user = required("RESERVE_MYSQL_LOGIN_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_login_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_login_test[a-z0-9_]*"))
            throw new IllegalArgumentException("Login method tests require a disposable loopback database and a dedicated test account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_LOGIN_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test void additiveSqlKeepsExistingMemberRowsAndPassesHibernateValidation() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
        var before = jdbc.queryForList("SELECT member_id, member_name, email, role, auth_version FROM member ORDER BY member_id");
        // 합성 fixture의 이전 스키마를 재현한 뒤 실제 출시용 SQL을 적용한다.
        jdbc.execute("DROP TABLE login_method_challenge");
        jdbc.execute("ALTER TABLE member DROP COLUMN login_methods_managed");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/login-methods.sql"));
            return null;
        });
        assertThat(jdbc.queryForList("SELECT member_id, member_name, email, role, auth_version FROM member ORDER BY member_id"))
                .isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE login_methods_managed <> FALSE", Integer.class)).isZero();
        factory.unwrap(SessionFactory.class).getSchemaManager().validateMappedObjects();
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated login-method fixture input: " + key);
        return value;
    }
}
