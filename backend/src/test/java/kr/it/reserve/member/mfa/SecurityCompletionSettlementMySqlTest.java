package kr.it.reserve.member.mfa;

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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// 기존 DB와 연결되지 않는 합성 스키마만 허용해요.
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_MFA_TEST_ISOLATED", matches = "1")
class SecurityCompletionSettlementMySqlTest extends SecurityCompletionSettlementTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory factory;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_MFA_TEST_URL");
        String user = required("RESERVE_MYSQL_MFA_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_mfa_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_mfa_test[a-z0-9_]*"))
            throw new IllegalArgumentException("MFA tests require a disposable loopback database and a dedicated account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_MFA_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test void additiveSqlPreservesExistingRowsAndValidates() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
        var membersBefore = jdbc.queryForList("SELECT member_id, auth_version FROM member ORDER BY member_id");
        var reservationsBefore = jdbc.queryForList("SELECT reservation_id, status, deposit_amount FROM reservation ORDER BY reservation_id");
        var paymentsBefore = jdbc.queryForList("SELECT payment_id, status, amount FROM payment ORDER BY payment_id");
        for (String table : java.util.List.of("mfa_recovery_code", "mfa_credential", "mfa_challenge", "mfa_account", "test_settlement_payout"))
            jdbc.execute("DROP TABLE " + table);
        jdbc.execute("ALTER TABLE store DROP COLUMN auto_completion_enabled, DROP COLUMN service_duration_minutes");
        jdbc.execute("ALTER TABLE reservation DROP INDEX idx_reservation_auto_completion, DROP COLUMN auto_completion_enabled, "
                + "DROP COLUMN attendance_refund_enabled, DROP COLUMN service_duration_minutes, DROP COLUMN usage_ends_at");
        jdbc.execute("ALTER TABLE payment DROP COLUMN verified_channel_type, DROP COLUMN verified_channel_id, "
                + "DROP COLUMN verified_store_id, DROP COLUMN verified_disputed");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/mfa-completion-settlement.sql"));
            return null;
        });
        assertThat(jdbc.queryForList("SELECT member_id, auth_version FROM member ORDER BY member_id")).isEqualTo(membersBefore);
        assertThat(jdbc.queryForList("SELECT reservation_id, status, deposit_amount FROM reservation ORDER BY reservation_id")).isEqualTo(reservationsBefore);
        assertThat(jdbc.queryForList("SELECT payment_id, status, amount FROM payment ORDER BY payment_id")).isEqualTo(paymentsBefore);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation WHERE auto_completion_enabled <> FALSE OR attendance_refund_enabled <> FALSE", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment WHERE verified_channel_type IS NOT NULL", Integer.class)).isZero();
        factory.unwrap(SessionFactory.class).getSchemaManager().validateMappedObjects();
        verifyJdbcEvidenceWithRestrictedRole();
    }

    private void verifyJdbcEvidenceWithRestrictedRole() {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/reservation-consent.sql"));
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/reservation-retention.sql"));
            return null;
        });
        var restricted = new org.springframework.jdbc.datasource.DriverManagerDataSource(
                required("RESERVE_MYSQL_MFA_TEST_URL"), "reserve_app", required("RESERVE_MYSQL_MFA_TEST_PASSWORD"));
        var app = new JdbcTemplate(restricted);
        try {
            var grants = app.queryForList("SHOW GRANTS", String.class);
            assertThat(grants).allSatisfy(grant -> assertThat(grant).doesNotContain(
                    "ALL PRIVILEGES", "CREATE", "ALTER", "DROP", "GRANT OPTION", "SUPER", "FILE"));
            assertThatThrownBy(() -> app.execute("CREATE TABLE forbidden_fixture(id BIGINT)"))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
            var transaction = new org.springframework.transaction.support.TransactionTemplate(
                    new org.springframework.jdbc.datasource.DataSourceTransactionManager(restricted));
            long reservation = jdbc.queryForObject("SELECT MIN(reservation_id) FROM reservation", Long.class);
            transaction.executeWithoutResult(status -> {
                assertThat(app.update("""
                        INSERT INTO reservation_consent(reservation_id,member_id,store_id,recipient_id,notice_version,
                            notice_hash,notice_snapshot,privacy_accepted,conditions_accepted,accepted_at,expires_at)
                        VALUES (?,1,1,1,'fixture',REPEAT('a',64),'{}',TRUE,TRUE,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
                        """, reservation)).isEqualTo(1);
                assertThat(app.update("""
                        INSERT INTO reservation_retention_hold(reservation_id,case_reference,purpose,held_by,held_at)
                        VALUES (?,'CASE_FIXTURE','DISPUTE',1,UTC_TIMESTAMP(6))
                        """, reservation)).isEqualTo(1);
                assertThat(app.queryForObject("SELECT notice_snapshot FROM reservation_consent WHERE reservation_id=?",
                        String.class, reservation)).isEqualTo("{}");
                assertThat(app.update("UPDATE reservation_retention_hold SET released_by=1,released_at=UTC_TIMESTAMP(6) WHERE reservation_id=?",
                        reservation)).isEqualTo(1);
                assertThat(app.update("DELETE FROM reservation_retention_hold WHERE reservation_id=?", reservation)).isEqualTo(1);
                assertThat(app.update("DELETE FROM reservation_consent WHERE reservation_id=?", reservation)).isEqualTo(1);
                status.setRollbackOnly();
            });
            assertThat(app.queryForObject("SELECT COUNT(*) FROM reservation_consent", Integer.class)).isZero();
            assertThat(app.queryForObject("SELECT COUNT(*) FROM reservation_retention_hold", Integer.class)).isZero();
        } finally {
            jdbc.execute("DROP TABLE reservation_retention_hold");
            jdbc.execute("DROP TABLE reservation_consent");
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated MFA fixture input: " + name);
        return value;
    }
}
