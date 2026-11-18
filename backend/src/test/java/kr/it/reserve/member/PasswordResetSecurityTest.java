package kr.it.reserve.member;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.PasswordResetToken;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import kr.it.reserve.member.service.PasswordResetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** 서비스 프록시의 실제 커밋·잠금·소비를 검사한다. 메일과 외부 비밀번호 조회는 호출하지 않는다. */
@SpringBootTest
class PasswordResetSecurityTest {

    private static final String EMAIL = "reset-security-test@example.com";
    private static final String WRONG_CODE = "000000";
    private static final String NEW_PASSWORD = "ChangedPassword123!";
    private static final String INVALID_CODE_MESSAGE = "인증 코드를 확인하지 못했어요. 코드를 다시 확인하거나 새로 요청해주세요.";

    @Autowired private PasswordResetService service;
    @Autowired private kr.it.reserve.member.controller.PasswordResetController controller;
    @Autowired private PasswordResetTokenRepository tokens;
    @Autowired private MemberRepository members;
    @Autowired private RefreshTokenRepository refreshTokens;
    @Autowired private BCryptPasswordEncoder encoder;
    @MockitoBean private EmailService emailService;
    @MockitoBean private PwnedPasswordChecker pwnedPasswordChecker;

    private TransactionTemplate tx;

    @Autowired
    void initTransactionTemplate(PlatformTransactionManager txManager) {
        tx = new TransactionTemplate(txManager);
    }

    @BeforeEach
    void setUp() {
        tx.executeWithoutResult(status -> {
            tokens.deleteByEmail(EMAIL);
            members.findByEmail(EMAIL).ifPresent(member -> {
                refreshTokens.deleteByMemberId(member.getId());
                members.delete(member);
                members.flush();
            });
            members.save(Member.builder().name("reset security test").email(EMAIL)
                    .password("old-password-hash").build());
        });
    }

    @Test
    void issuedCodeIsStoredAsHashAndSentToTheEmailOnly() {
        String code = issueCode();
        PasswordResetToken stored = currentToken();

        assertThat(code).matches("[1-9][0-9]{5}");
        assertThat(stored.getToken()).isEqualTo("HASHED");
        assertThat(stored.getTokenHash()).hasSize(60);
        assertThat(encoder.matches(code, stored.getTokenHash())).isTrue();
        assertThat(stored.isVerified()).isFalse();
        assertThat(stored.getAttemptCount()).isZero();
    }

    @Test
    void hashCodeVerifiesAndIsConsumedOnceWithEverySessionInvalidated() {
        String code = issueCode();
        Long memberId = members.findByEmail(EMAIL).orElseThrow().getId();
        tx.executeWithoutResult(status -> refreshTokens.save(
                new RefreshToken(memberId, "reset-test-session", LocalDateTime.now().plusDays(1))));

        assertThat(service.verifyCode(EMAIL, code)).isEqualTo(
                currentToken().getExpiresAt().atZone(java.time.ZoneId.systemDefault()).toInstant());
        service.resetPassword(EMAIL, code, NEW_PASSWORD);

        Member updated = members.findByEmail(EMAIL).orElseThrow();
        assertThat(encoder.matches(NEW_PASSWORD, updated.getPassword())).isTrue();
        assertThat(updated.getAuthVersion()).isEqualTo(1);
        assertThat(refreshTokens.findByMemberId(memberId)).isEmpty();
        assertThat(tokens.findTopByEmailOrderByIdDesc(EMAIL)).isEmpty();
        assertThatThrownBy(() -> service.resetPassword(EMAIL, code, NEW_PASSWORD))
                .isInstanceOf(MemberException.class).hasMessage(INVALID_CODE_MESSAGE);
        assertThat(members.findByEmail(EMAIL).orElseThrow().getAuthVersion()).isEqualTo(1);
    }

    @Test
    void bothHashCodeEntryPointsPersistFailuresAndEnforceTheSameLimit() {
        String code = issueCode();
        assertThatThrownBy(() -> service.verifyCode(EMAIL, WRONG_CODE)).isInstanceOf(MemberException.class);
        for (int i = 1; i < PasswordResetToken.MAX_VERIFY_ATTEMPTS; i++) {
            assertThatThrownBy(() -> service.resetPassword(EMAIL, WRONG_CODE, NEW_PASSWORD))
                    .isInstanceOf(MemberException.class);
        }
        assertThat(currentToken().getAttemptCount()).isEqualTo(PasswordResetToken.MAX_VERIFY_ATTEMPTS);
        assertThatThrownBy(() -> service.verifyCode(EMAIL, code))
                .isInstanceOf(MemberException.class).hasMessage(INVALID_CODE_MESSAGE);
        assertThatThrownBy(() -> service.resetPassword(EMAIL, code, NEW_PASSWORD))
                .isInstanceOf(MemberException.class).hasMessage(INVALID_CODE_MESSAGE);
        assertThat(members.findByEmail(EMAIL).orElseThrow().getAuthVersion()).isZero();
    }

    @Test
    void expiredHashCodeCannotBeVerifiedOrConsumed() throws Exception {
        saveToken("HASHED", encoder.encode("123456"), LocalDateTime.now().minusSeconds(1));
        assertThatThrownBy(() -> service.verifyCode(EMAIL, "123456"))
                .isInstanceOf(MemberException.class).hasMessage(INVALID_CODE_MESSAGE);
        assertThatThrownBy(() -> service.resetPassword(EMAIL, "123456", NEW_PASSWORD))
                .isInstanceOf(MemberException.class).hasMessage(INVALID_CODE_MESSAGE);
        assertThat(currentToken().getAttemptCount()).isZero();
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/password-reset/reset")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\",\"code\":\"123456\",\"newPassword\":\""
                                + NEW_PASSWORD + "\",\"newPasswordConfirm\":\"" + NEW_PASSWORD + "\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.code")
                        .value("PASSWORD_RESET_CODE_INVALID"));
    }

    @Test
    void resendReplacesTheOldRowAndResetsVerificationAndAttempts() {
        String firstCode = issueCode();
        Long firstId = currentToken().getId();
        service.verifyCode(EMAIL, firstCode);
        assertThatThrownBy(() -> service.verifyCode(EMAIL, WRONG_CODE)).isInstanceOf(MemberException.class);

        String secondCode = issueCode();
        PasswordResetToken replacement = currentToken();
        assertThat(replacement.getId()).isNotEqualTo(firstId);
        assertThat(tokens.findById(firstId)).isEmpty();
        assertThat(tokens.findIdsByEmail(EMAIL)).containsExactly(replacement.getId());
        assertThat(encoder.matches(secondCode, replacement.getTokenHash())).isTrue();
        assertThat(replacement.isVerified()).isFalse();
        assertThat(replacement.getAttemptCount()).isZero();
    }

    @Test
    void unexpiredLegacyCodeStillVerifiesAndResetsDuringTheTransition() {
        saveToken("123456", null, LocalDateTime.now().plusMinutes(5));
        service.verifyCode(EMAIL, "123456");
        service.resetPassword(EMAIL, "123456", NEW_PASSWORD);
        assertThat(encoder.matches(NEW_PASSWORD, members.findByEmail(EMAIL).orElseThrow().getPassword())).isTrue();
        assertThat(tokens.findTopByEmailOrderByIdDesc(EMAIL)).isEmpty();
    }

    @Test
    void missingHashAndMalformedCodeFailClosedAndCountFailures() {
        saveToken("HASHED", null, LocalDateTime.now().plusMinutes(5));
        assertThatThrownBy(() -> service.verifyCode(EMAIL, "123456")).isInstanceOf(MemberException.class);
        assertThatThrownBy(() -> service.verifyCode(EMAIL, null)).isInstanceOf(MemberException.class);
        assertThat(currentToken().getAttemptCount()).isEqualTo(2);
        assertThat(currentToken().isVerified()).isFalse();
    }

    @Test
    void oauthOnlyAndMissingAccountsDoNotCreateCodesOrSendMail() {
        tx.executeWithoutResult(status -> members.findByEmail(EMAIL).orElseThrow().setPassword(null));
        assertThat(service.sendResetCode(EMAIL)).isFalse();
        assertThat(service.sendResetCode("missing-reset-test@example.com")).isFalse();
        assertThat(tokens.findTopByEmailOrderByIdDesc(EMAIL)).isEmpty();
        verifyNoInteractions(emailService);
    }

    @Test
    void publicCodeFailuresDoNotDistinguishMissingAndSocialOnlyAccounts() {
        String code = issueCode();
        assertCodeFailure(() -> service.verifyCode(EMAIL, WRONG_CODE));
        assertCodeFailure(() -> service.verifyCode("missing-reset-test@example.com", WRONG_CODE));
        service.verifyCode(EMAIL, code);
        tx.executeWithoutResult(status -> {
            Member member = members.findByEmail(EMAIL).orElseThrow();
            member.setProvider(AuthProvider.NAVER);
            member.setProviderId("synthetic-reset-subject");
            member.setPassword(null);
        });

        // 이미 인증된 코드가 남아 있어도 이메일 로그인을 복원할 수 없다.
        assertCodeFailure(() -> service.verifyCode(EMAIL, code));
        assertCodeFailure(() -> service.resetPassword(EMAIL, code, NEW_PASSWORD));
        Member member = members.findByEmail(EMAIL).orElseThrow();
        assertThat(member.getPassword()).isNull();
        assertThat(member.getAuthVersion()).isZero();
        assertThat(currentToken().getAttemptCount()).isOne();
    }

    private void assertCodeFailure(Runnable operation) {
        assertThatThrownBy(operation::run)
                .isInstanceOfSatisfying(MemberException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(error.getMessage()).isEqualTo(INVALID_CODE_MESSAGE);
                });
    }

    @Test
    void invalidPasswordDoesNotConsumeTheVerifiedCodeOrChangeTheMember() {
        String code = issueCode();
        service.verifyCode(EMAIL, code);
        assertThatThrownBy(() -> service.resetPassword(EMAIL, code, "short"))
                .isInstanceOf(MemberException.class);
        assertThat(currentToken().isVerified()).isTrue();
        assertThat(currentToken().getAttemptCount()).isZero();
        assertThat(members.findByEmail(EMAIL).orElseThrow().getAuthVersion()).isZero();
        service.resetPassword(EMAIL, code, NEW_PASSWORD);
        assertThat(encoder.matches(NEW_PASSWORD, members.findByEmail(EMAIL).orElseThrow().getPassword())).isTrue();
    }

    @Test
    void concurrentFailedRequestsCannotLoseIncrementsOrExceedFiveAttempts() throws Exception {
        issueCode();
        List<Boolean> results = concurrentRequests(8, () -> {
            try {
                service.verifyCode(EMAIL, WRONG_CODE);
                return true;
            } catch (MemberException expected) {
                return false;
            }
        });
        assertThat(results).containsOnly(false);
        assertThat(currentToken().getAttemptCount()).isEqualTo(PasswordResetToken.MAX_VERIFY_ATTEMPTS);
    }

    @Test
    void twoConcurrentResetsConsumeTheCodeExactlyOnce() throws Exception {
        String code = issueCode();
        service.verifyCode(EMAIL, code);
        List<Boolean> results = concurrentRequests(2, () -> {
            try {
                service.resetPassword(EMAIL, code, NEW_PASSWORD);
                return true;
            } catch (MemberException expected) {
                return false;
            }
        });
        assertThat(results).containsExactlyInAnyOrder(true, false);
        Member updated = members.findByEmail(EMAIL).orElseThrow();
        assertThat(updated.getAuthVersion()).isEqualTo(1);
        assertThat(encoder.matches(NEW_PASSWORD, updated.getPassword())).isTrue();
        assertThat(tokens.findTopByEmailOrderByIdDesc(EMAIL)).isEmpty();
    }

    private String issueCode() {
        assertThat(service.sendResetCode(EMAIL)).isTrue();
        var code = ArgumentCaptor.forClass(String.class);
        verify(emailService, atLeastOnce()).sendPasswordResetEmail(eq(EMAIL), code.capture());
        return code.getValue();
    }

    private PasswordResetToken currentToken() {
        return tokens.findTopByEmailOrderByIdDesc(EMAIL).orElseThrow();
    }

    private void saveToken(String legacyValue, String hash, LocalDateTime expiry) {
        tx.executeWithoutResult(status -> tokens.save(PasswordResetToken.builder()
                .email(EMAIL).token(legacyValue).tokenHash(hash).expiresAt(expiry).build()));
    }

    private List<Boolean> concurrentRequests(int count, Callable<Boolean> request) throws Exception {
        var ready = new CountDownLatch(count);
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(count);
        try {
            List<Future<Boolean>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Concurrent request start timed out");
                    }
                    return request.call();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Boolean> results = new ArrayList<>();
            for (Future<Boolean> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }
}
