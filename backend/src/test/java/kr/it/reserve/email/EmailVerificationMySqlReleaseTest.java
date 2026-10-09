package kr.it.reserve.email;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** Release-only MySQL contracts. Use a fresh synthetic database, never a restored backup or production DB. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_SIGNUP_TEST_ISOLATED", matches = "1")
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@ContextConfiguration(classes = EmailVerificationMySqlReleaseTest.Config.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class EmailVerificationMySqlReleaseTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = EmailVerification.class)
    @EnableJpaRepositories(basePackageClasses = EmailVerificationRepository.class)
    @Import(EmailVerificationService.class)
    static class Config {}

    private static final String EMAIL = "release-signup@example.invalid";
    @Autowired EmailVerificationRepository entries;
    @Autowired EmailVerificationService verification;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean MemberRepository members;
    @MockitoBean EmailService mail;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_SIGNUP_TEST_URL");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_signup_[a-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("Signup release tests require a loopback isolated database with the reserved prefix");
        }
        String user = required("RESERVE_MYSQL_SIGNUP_TEST_USER");
        if (!user.matches("reserve_signup_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("Signup release tests require a dedicated restricted test account");
        }
        String password = required("RESERVE_MYSQL_SIGNUP_TEST_PASSWORD");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> password);
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated signup test setting: " + name);
        return value;
    }

    @BeforeEach void requireMatchingMySqlAndEmptyFixture() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
        entries.deleteAll();
    }

    @AfterEach void clearSyntheticEntries() { entries.deleteAll(); }

    private void issueCode() {
        entries.saveAndFlush(EmailVerification.builder().email(EMAIL).verificationCode("123456")
                .expiresAt(LocalDateTime.now().plusMinutes(5)).build());
    }

    @Test void concurrentFirstRequestsKeepOneRowAndSendOneEmail() throws Exception {
        // Both transactions hold the missing-row gap before attempting the real service insert.
        CyclicBarrier absentReads = new CyclicBarrier(2);
        List<Throwable> results = race(2, () -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertThat(entries.findTopByEmailOrderByCreatedAtDesc(EMAIL)).isEmpty();
            await(absentReads);
            verification.sendVerificationCode(EMAIL);
        }));
        assertThat(results.stream().filter(Objects::isNull).count()).isEqualTo(1);
        assertThat(results.stream().filter(Objects::nonNull).toList()).hasSize(1).allSatisfy(failure ->
                assertThat(failure).isInstanceOfAny(EmailException.class, PessimisticLockingFailureException.class));
        assertThat(entries.count()).isEqualTo(1);
        verify(mail, times(1)).sendVerificationEmail(anyString(), anyString());
    }

    @Test void concurrentWrongCodesAccumulateAllFailuresAndCannotBeBypassedWithTheCorrectCode() throws Exception {
        issueCode();
        List<Throwable> results = race(5, () -> verification.verifyCodeAndIssueTicket(EMAIL, "000000"));
        assertThat(results).allSatisfy(failure -> assertThat(failure).isInstanceOf(EmailException.class));
        Integer attemptCount = new TransactionTemplate(transactions).execute(status ->
                entries.findTopByEmailOrderByCreatedAtDesc(EMAIL).orElseThrow().getAttemptCount());
        assertThat(attemptCount).isEqualTo(5);
        assertThatThrownBy(() -> verification.verifyCodeAndIssueTicket(EMAIL, "123456")).isInstanceOf(EmailException.class);
        assertThat(entries.findByEmailAndVerifiedTrue(EMAIL)).isEmpty();
    }

    @Test void simultaneousSignupProofConsumptionSucceedsOnlyOnce() throws Exception {
        issueCode();
        var proof = verification.verifyCodeAndIssueTicket(EMAIL, "123456");
        List<Throwable> results = race(2, () -> new TransactionTemplate(transactions).executeWithoutResult(status ->
                verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket())));
        assertThat(results.stream().filter(Objects::isNull).count()).isEqualTo(1);
        assertThat(results.stream().filter(Objects::nonNull).toList()).hasSize(1).allSatisfy(failure ->
                assertThat(failure).isInstanceOf(EmailException.class));
        assertThat(entries.count()).isZero();
    }

    @Test void failedSignupRollsConsumptionBackWithoutRenewingTheProofExpiry() {
        issueCode();
        var proof = verification.verifyCodeAndIssueTicket(EMAIL, "123456");
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket());
            throw new IllegalStateException("synthetic account write failed");
        })).isInstanceOf(IllegalStateException.class);
        var restored = entries.findByEmailAndVerifiedTrue(EMAIL).orElseThrow();
        assertThat(restored.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant()).isEqualTo(proof.expiresAt());
        transaction.executeWithoutResult(status -> verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket()));
        assertThat(entries.count()).isZero();
    }

    @Test void expiredOrIncorrectProofLeavesTheRowUnconsumed() {
        issueCode();
        var proof = verification.verifyCodeAndIssueTicket(EMAIL, "123456");
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                verification.consumeVerifiedEmail(EMAIL, "b".repeat(43)))).isInstanceOf(EmailException.class);
        transaction.executeWithoutResult(status -> {
            var value = entries.findTopByEmailOrderByCreatedAtDesc(EMAIL).orElseThrow();
            value.setExpiresAt(LocalDateTime.now().minusSeconds(1));
            entries.saveAndFlush(value);
        });
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket()))).isInstanceOf(EmailException.class);
        assertThat(entries.count()).isEqualTo(1);
    }

    private static void await(CyclicBarrier barrier) {
        try {
            barrier.await(10, TimeUnit.SECONDS);
        } catch (Exception failure) {
            throw new IllegalStateException("Concurrent isolated test barrier failed", failure);
        }
    }

    private static List<Throwable> race(int workers, Runnable action) throws Exception {
        var executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Throwable>> pending = new ArrayList<>();
        try {
            for (int index = 0; index < workers; index++) {
                pending.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent isolated test did not start");
                    try {
                        action.run();
                        return null;
                    } catch (RuntimeException failure) {
                        return failure;
                    }
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Throwable> results = new ArrayList<>();
            for (Future<Throwable> future : pending) results.add(future.get(20, TimeUnit.SECONDS));
            return results;
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }
}
