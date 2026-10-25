package kr.it.reserve.config;

import jakarta.persistence.EntityManagerFactory;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** 명시적으로 격리한 일회성 로그인 시험 DB만 사용한다. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_LOGIN_TEST_ISOLATED", matches = "1")
class JwtSessionMySqlTest extends RefreshRotationPersistenceTest {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManagerFactory factory;
    @Autowired private TokenProvider signer;
    @Autowired private RefreshTokenRepository sessions;
    @Autowired private PlatformTransactionManager transactions;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_LOGIN_TEST_URL");
        String user = required("RESERVE_MYSQL_LOGIN_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_login_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_login_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("JWT session tests require a disposable loopback database and a dedicated test account");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_LOGIN_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test void additiveSessionSqlPreservesMembersAndPassesHibernateValidation() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
        var before = jdbc.queryForList("SELECT member_id, member_name, email, role, auth_version FROM member ORDER BY member_id");
        jdbc.execute("DROP TABLE login_session");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/jwt-session.sql"));
            return null;
        });
        assertThat(jdbc.queryForList("SELECT member_id, member_name, email, role, auth_version FROM member ORDER BY member_id"))
                .isEqualTo(before);
        factory.unwrap(SessionFactory.class).getSchemaManager().validateMappedObjects();
        var issued = signer.issueSession(member, null);
        assertThat(signer.getActiveMemberFromToken(issued.accessToken()).getId()).isEqualTo(member.getId());
    }

    @Test void simultaneousLoginsWithOlderRepeatableReadSnapshotsCannotExceedFiveDevices() throws Exception {
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
        for (int i = 0; i < 4; i++) signer.issueSession(member, null);
        CountDownLatch snapshots = new CountDownLatch(2), release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Callable<TokenProvider.IssuedSession> issue = () -> {
                TransactionTemplate tx = new TransactionTemplate(transactions);
                tx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
                tx.setTimeout(15);
                return tx.execute(status -> {
                    // 일반 조회·건수 조회는 다른 로그인 커밋 뒤에도 기존 네 행의 읽기 스냅샷을 유지한다.
                    assertThat(sessions.findByMemberId(member.getId())).hasSize(4);
                    snapshots.countDown();
                    try {
                        if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Login release timed out");
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException("Login fixture interrupted", interrupted);
                    }
                    return signer.issueSession(member, null);
                });
            };
            Future<TokenProvider.IssuedSession> first = executor.submit(issue), second = executor.submit(issue);
            assertThat(snapshots.await(10, TimeUnit.SECONDS)).isTrue();
            release.countDown();
            assertThat(first.get(20, TimeUnit.SECONDS).accessToken()).isNotBlank();
            assertThat(second.get(20, TimeUnit.SECONDS).accessToken()).isNotBlank();
            assertThat(sessions.findByMemberId(member.getId())).hasSize(5);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated JWT session fixture input: " + key);
        return value;
    }
}
