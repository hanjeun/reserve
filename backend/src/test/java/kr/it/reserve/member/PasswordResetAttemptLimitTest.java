package kr.it.reserve.member;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.PasswordResetToken;
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

    /**
     * 준비 작업만 트랜잭션에 태운다. 테스트 메서드 자체는 트랜잭션 밖이어야
     * 서비스가 진짜로 커밋했는지를 볼 수 있다(클래스에 {@code @Transactional} 을 붙이면
     * 전부 한 트랜잭션에 묶여 이 테스트의 의미가 사라진다).
     * {@code deleteByEmail} 같은 파생 delete 쿼리는 트랜잭션이 없으면 예외가 난다.
     */
    private TransactionTemplate tx;

    @Autowired
    void initTransactionTemplate(PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
    }

    @BeforeEach
    void setUp() {
        tx.executeWithoutResult(status -> {
            tokenRepository.deleteByEmail(EMAIL);
            tokenRepository.save(PasswordResetToken.builder()
                    .email(EMAIL)
                    .token(REAL_CODE)
                    .expiresAt(LocalDateTime.now().plusMinutes(5))
                    .build());
        });
    }

    /**
     * 이 테스트가 이 파일의 존재 이유다.
     *
     * <p>{@code noRollbackFor} 를 빼면 여기서 {@code attemptCount} 가 0 으로 나오며 실패한다.
     */
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

        // 상한을 넘기면 **맞는 코드도 거부**해야 한다. 여기가 뚫리면 공격자는 상한을 소진한 뒤
        // 계속 시도하면 되므로 방어가 통째로 무의미해진다.
        assertThatThrownBy(() -> passwordResetService.verifyCode(EMAIL, REAL_CODE))
                .isInstanceOf(MemberException.class)
                .hasMessageContaining("초과");
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
