package kr.it.reserve.member.mfa;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.fail;
import static org.mockito.Mockito.verifyNoInteractions;

/** 폐기 가능한 별도 loopback DB에서 계정·인증의 이전 RR snapshot을 검사해요. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_AUTH_STATE_TEST_ISOLATED", matches = "1")
class AccountProtectionCurrentStateMySqlTest extends AccountProtectionFlowTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired MfaService mfa;
    @Autowired AccountProtectionService protection;
    @Autowired MfaChallengeRepository challenges;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_AUTH_STATE_TEST_URL");
        String user = required("RESERVE_MYSQL_AUTH_STATE_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_auth_state_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_auth_state_test[a-z0-9_]*"))
            throw new IllegalArgumentException("Authentication state tests require a disposable loopback database and a dedicated account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_AUTH_STATE_TEST_PASSWORD"));
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

    @ParameterizedTest
    @ValueSource(strings = {"CONSUMED", "FAILED", "EXPIRED"})
    void challengeChangedAfterAnEarlierSnapshotCannotBecomeActiveAgain(String change) {
        Fixture owner = account(Role.USER, true);
        String raw = loginChallenge(owner.member());
        assertThatThrownBy(() -> snapshot().executeWithoutResult(ignored -> {
            var stale = challenges.findById(MfaCrypto.digest(raw)).orElseThrow();
            separately(() -> {
                var current = challenges.findById(stale.getId()).orElseThrow();
                switch (change) {
                    case "CONSUMED" -> current.consume(now());
                    case "FAILED" -> { for (int i = 0; i < 5; i++) current.failed(); }
                    case "EXPIRED" -> current.limitExpiry(now().minusSeconds(1));
                    default -> throw new IllegalArgumentException("Unknown synthetic challenge change");
                }
            });
            try {
                mfa.status(raw, null, null);
                fail("A revoked challenge must remain unavailable");
            } catch (AuthException failure) {
                assertThat(entityManager.contains(stale)).isTrue();
                assertThat(challenges.findById(stale.getId()).orElseThrow()).isSameAs(stale);
                assertThat(stale.active(now())).isFalse();
                throw failure;
            }
        })).isInstanceOf(AuthException.class);
    }

    @Test
    void memberRevokedAfterAnEarlierSnapshotCannotUsePendingMfa() {
        Fixture owner = account(Role.USER, true);
        String raw = loginChallenge(owner.member());
        int before = owner.member().getAuthVersion();
        assertThatThrownBy(() -> snapshot().executeWithoutResult(ignored -> {
            var stale = members.findById(owner.member().getId()).orElseThrow();
            separately(() -> members.findById(stale.getId()).orElseThrow().rotateAuthVersion());
            try {
                mfa.status(raw, null, null);
                fail("A previous authentication version must remain unavailable");
            } catch (AuthException failure) {
                assertThat(entityManager.contains(stale)).isTrue();
                assertThat(members.findById(stale.getId()).orElseThrow()).isSameAs(stale);
                assertThat(stale.getAuthVersion()).isEqualTo(before + 1);
                throw failure;
            }
        })).isInstanceOf(AuthException.class);
    }

    @Test
    void targetChangedAfterAnEarlierSnapshotNeedsNewAdministratorProtectionProof() {
        Fixture admin = account(Role.ADMIN, true);
        Fixture owner = account(Role.USER, true);
        var session = tokens.issueVerifiedSession(admin.member(), null, "PASSWORD_MFA");
        String sid = tokens.getSessionId(session.accessToken());
        String raw = crypto.randomToken();
        var challenge = new MfaChallenge(MfaCrypto.digest(raw), admin.member().getId(), MfaChallenge.Purpose.ADMIN_PROTECT,
                "PASSWORD", admin.member().getAuthVersion(), null, now().plusMinutes(5));
        challenge.bindSession(sid);
        challenge.bindTarget(owner.member().getId(), owner.member().getAuthVersion());
        challenge.verified();
        challenges.saveAndFlush(challenge);

        assertThatThrownBy(() -> snapshot().executeWithoutResult(ignored -> {
            var stale = members.findById(owner.member().getId()).orElseThrow();
            separately(() -> members.findById(stale.getId()).orElseThrow().rotateAuthVersion());
            protection.protect(admin.member(), sid, raw, stale.getId(), "합성 상태 변경 시험", false);
        })).isInstanceOfSatisfying(AuthException.class,
                failure -> assertThat(failure.getStatus()).isEqualTo(org.springframework.http.HttpStatus.PRECONDITION_REQUIRED));
        assertThat(current(owner).isAccountProtected()).isFalse();
        assertThat(challenges.findById(challenge.getId()).orElseThrow().active(now())).isTrue();
        verifyNoInteractions(email);
    }

    private String loginChallenge(Member member) {
        String raw = crypto.randomToken();
        challenges.saveAndFlush(new MfaChallenge(MfaCrypto.digest(raw), member.getId(), MfaChallenge.Purpose.LOGIN,
                "PASSWORD", member.getAuthVersion(), null, now().plusMinutes(5)));
        return raw;
    }

    private TransactionTemplate snapshot() {
        var transaction = new TransactionTemplate(transactions);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return transaction;
    }

    private void separately(Runnable work) {
        var transaction = new TransactionTemplate(transactions);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.executeWithoutResult(ignored -> work.run());
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated authentication fixture input: " + key);
        return value;
    }
}
