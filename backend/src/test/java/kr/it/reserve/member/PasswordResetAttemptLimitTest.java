package kr.it.reserve.member;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.PasswordResetToken;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import kr.it.reserve.member.service.PasswordResetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실패 횟수가 예외 뒤에도 커밋되는지 실제 DB·서비스 프록시로 확인한다. 시험을 외부 트랜잭션으로 감싸지 않는다. */
@SpringBootTest
class PasswordResetAttemptLimitTest {

    private static final String EMAIL = "attempt-limit-test@example.com";
    private static final String REAL_CODE = "123456";
    private static final String WRONG_CODE = "000000";

    @Autowired
    private PasswordResetService passwordResetService;

    @Autowired
    private PasswordResetTokenRepository tokenRepository;
    @Autowired
    private MemberRepository members;

    /** 실제 커밋을 검증하므로 시험 메서드는 트랜잭션 밖에 두고, 파생 삭제 쿼리가 있는 준비 작업만 묶는다. */
    private TransactionTemplate tx;

    @Autowired
    void initTransactionTemplate(PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
    }

    @BeforeEach
    void setUp() {
        tx.executeWithoutResult(status -> {
            members.findByEmail(EMAIL).orElseGet(() -> members.save(
                    Member.builder().name("attempt limit test").email(EMAIL).password("fixture-hash").build()));
            tokenRepository.deleteByEmail(EMAIL);
            tokenRepository.save(PasswordResetToken.builder()
                    .email(EMAIL)
                    .token(REAL_CODE)
                    .expiresAt(LocalDateTime.now().plusMinutes(5))
                    .build());
        });
    }

    /** 검증 예외에도 실패 횟수가 커밋되도록 {@code noRollbackFor} 경계를 검증한다. */
    @Test
    void failedAttemptIsPersistedEvenThoughTheServiceThrows() {
        assertThatThrownBy(() -> passwordResetService.verifyCode(EMAIL, WRONG_CODE))
                .isInstanceOf(MemberException.class);

        int persisted = tokenRepository.findTopByEmailOrderByIdDesc(EMAIL)
                .orElseThrow()
                .getAttemptCount();

        assertThat(persisted)
                .as("실패 카운터가 예외와 함께 롤백되면 상한이 무의미해진다")
                .isEqualTo(1);
    }

    @Test
    void tokenDiesAfterMaxAttemptsAndRejectsEvenTheCorrectCode() {
        for (int i = 0; i < PasswordResetToken.MAX_VERIFY_ATTEMPTS; i++) {
            assertThatThrownBy(() -> passwordResetService.verifyCode(EMAIL, WRONG_CODE))
                    .isInstanceOf(MemberException.class);
        }

        assertThat(tokenRepository.findTopByEmailOrderByIdDesc(EMAIL).orElseThrow().getAttemptCount())
                .isEqualTo(PasswordResetToken.MAX_VERIFY_ATTEMPTS);

        // 소진된 코드를 계속 대조할 수 없도록 상한 이후에는 맞는 코드도 거부한다.
        assertThatThrownBy(() -> passwordResetService.verifyCode(EMAIL, REAL_CODE))
                .isInstanceOf(MemberException.class)
                .hasMessage("인증 코드를 확인하지 못했어요. 코드를 다시 확인하거나 새로 요청해주세요.");
    }

    /** 재설정 경로도 코드별 실패 횟수를 소모해 검증 API 우회를 막는다. */
    @Test
    void resetPathAlsoCountsFailedAttempts() {
        assertThatThrownBy(() -> passwordResetService.resetPassword(EMAIL, WRONG_CODE, "Str0ng!Passw0rd#2026"))
                .isInstanceOf(MemberException.class);

        assertThat(tokenRepository.findTopByEmailOrderByIdDesc(EMAIL).orElseThrow().getAttemptCount())
                .as("reset 경로에 카운터가 없으면 verify-code 를 건너뛰고 무제한으로 시도할 수 있다")
                .isEqualTo(1);
    }

    @Test
    void correctCodeStillVerifies() {
        passwordResetService.verifyCode(EMAIL, REAL_CODE);

        PasswordResetToken token = tokenRepository.findTopByEmailOrderByIdDesc(EMAIL).orElseThrow();
        assertThat(token.isVerified()).isTrue();
        assertThat(token.getAttemptCount()).isZero();
    }
}
