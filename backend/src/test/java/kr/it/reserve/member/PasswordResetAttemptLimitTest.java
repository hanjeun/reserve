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

/**
 * 비밀번호 재설정 코드의 시도 횟수 상한 검증.
 *
 * <h2>왜 단위 테스트가 아니라 통합 테스트인가</h2>
 * 검증하려는 것이 <b>트랜잭션 경계의 동작</b>이기 때문이다. {@code BusinessException} 은
 * {@code RuntimeException} 이라, 실패 카운터를 올린 뒤 예외를 던지면 스프링 기본 규칙상
 * 트랜잭션이 롤백되면서 <b>그 증가분까지 같이 사라진다.</b> 그러면 카운터는 코드상 존재하는데
 * DB 에는 영원히 0 으로 남아, 상한이 있는 것처럼 보이지만 실제로는 무제한이 된다.
 *
 * <p>Mockito 단위 테스트에는 트랜잭션이 없으므로 이 함정을 <b>재현조차 못 한다</b> —
 * 카운터가 메모리에서 올라가는 것만 보고 통과한다. 그래서 실제 DB 와 프록시를 태운다.
 *
 * <p>{@code @Transactional} 을 테스트 클래스에 붙이지 않는 것도 의도적이다. 붙이면 테스트가
 * 하나의 트랜잭션 안에서 돌아 서비스의 커밋이 관찰되지 않는다.
 */
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
     * ★ 이 테스트가 이 파일의 존재 이유다.
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

    /**
     * {@code /reset} 은 {@code verified} 를 보기 <b>전에</b> 코드를 대조하므로
     * {@code verify-code} 를 건너뛰고 여기만 두드리는 우회가 가능했다.
     * 검증 경로가 둘이면 카운터도 둘 다 걸려야 한다.
     */
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
