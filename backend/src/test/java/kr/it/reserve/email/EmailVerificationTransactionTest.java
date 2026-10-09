package kr.it.reserve.email;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** H2 transaction contracts; the production MySQL locking boundary needs separate release verification. */
@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@ActiveProfiles("test")
@ContextConfiguration(classes = EmailVerificationTransactionTest.Config.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class EmailVerificationTransactionTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = EmailVerification.class)
    @EnableJpaRepositories(basePackageClasses = EmailVerificationRepository.class)
    @Import(EmailVerificationService.class)
    static class Config {}

    private static final String EMAIL = "signup-proof@example.com";
    @Autowired EmailVerificationRepository entries;
    @Autowired EmailVerificationService verification;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean MemberRepository members;
    @MockitoBean EmailService mail;

    @AfterEach void clearEntries() { entries.deleteAll(); }

    private void issueCode() {
        entries.saveAndFlush(EmailVerification.builder().email(EMAIL).verificationCode("123456")
                .expiresAt(LocalDateTime.now().plusMinutes(5)).build());
    }

    @Test void failedAccountCreationRestoresTheProofAndSuccessfulCreationConsumesItOnce() {
        issueCode();
        var proof = verification.verifyCodeAndIssueTicket(EMAIL, "123456");
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket());
            throw new IllegalStateException("account persistence failed");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(entries.findByEmailAndVerifiedTrue(EMAIL)).isPresent();

        transaction.executeWithoutResult(status -> verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket()));
        assertThat(entries.findByEmailAndVerifiedTrue(EMAIL)).isEmpty();
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket()))).isInstanceOf(EmailException.class);
    }

    @Test void wrongProofDoesNotConsumeTheRowAndNoStandaloneConsumptionIsAllowed() {
        issueCode();
        var proof = verification.verifyCodeAndIssueTicket(EMAIL, "123456");
        assertThatThrownBy(() -> verification.consumeVerifiedEmail(EMAIL, proof.verificationTicket()))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status ->
                verification.consumeVerifiedEmail(EMAIL, "b".repeat(43)))).isInstanceOf(EmailException.class);
        assertThat(entries.findByEmailAndVerifiedTrue(EMAIL)).isPresent();
    }

    @Test void failedAttemptsSurviveServiceExceptionsAndBlockTheCorrectCodeAfterFive() {
        issueCode();
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> verification.verifyCodeAndIssueTicket(EMAIL, "000000")).isInstanceOf(EmailException.class);
        }
        Integer attemptCount = new TransactionTemplate(transactions).execute(status ->
                entries.findTopByEmailOrderByCreatedAtDesc(EMAIL).orElseThrow().getAttemptCount());
        assertThat(attemptCount).isEqualTo(5);
        assertThatThrownBy(() -> verification.verifyCodeAndIssueTicket(EMAIL, "123456")).isInstanceOf(EmailException.class);
        assertThat(entries.findByEmailAndVerifiedTrue(EMAIL)).isEmpty();
    }

    @Test void theDatabaseAllowsOnlyOneActiveVerificationRowPerEmail() {
        issueCode();
        assertThatThrownBy(this::issueCode).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(entries.count()).isEqualTo(1);
    }
}
