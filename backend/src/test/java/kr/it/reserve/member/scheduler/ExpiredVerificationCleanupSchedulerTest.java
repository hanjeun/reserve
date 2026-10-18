package kr.it.reserve.member.scheduler;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.member.entity.PasswordResetToken;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.Clock;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false)
@Import(ExpiredVerificationCleanupScheduler.class)
class ExpiredVerificationCleanupSchedulerTest {
    @Autowired EmailVerificationRepository emails;
    @Autowired PasswordResetTokenRepository resets;
    @Autowired ExpiredVerificationCleanupScheduler scheduler;

    @Test void removesOnlyExpiredSignupProofsAndPasswordResetCodes() {
        LocalDateTime now = LocalDateTime.now(Clock.systemDefaultZone());
        for (boolean expired : new boolean[]{true, false}) {
            String email = expired ? "old@example.invalid" : "active@example.invalid";
            LocalDateTime expiry = expired ? now.minusMinutes(1) : now.plusMinutes(5);
            emails.save(EmailVerification.builder().email(email).verificationCode("000000")
                    .verified(true).verificationTicketHash("a".repeat(64)).expiresAt(expiry).build());
            resets.save(PasswordResetToken.builder().email(email).token("000000").expiresAt(expiry).build());
        }
        emails.flush();
        resets.flush();

        scheduler.cleanupExpiredVerifications();

        assertThat(emails.findAll()).extracting(EmailVerification::getEmail).containsExactly("active@example.invalid");
        assertThat(resets.findAll()).extracting(PasswordResetToken::getEmail).containsExactly("active@example.invalid");
    }
}
