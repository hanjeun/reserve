package kr.it.reserve.email.service;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceContractTest {

    private static final String EMAIL = "verification@example.com";
    private static final String EXISTING_CODE = "123456";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 12, 0);

    @Mock private EmailVerificationRepository verificationRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private EmailService emailService;

    @InjectMocks private EmailVerificationService service;

    private MockedStatic<Clock> clock;

    @BeforeEach
    void fixCurrentTime() {
        Clock fixedClock = Clock.fixed(Instant.parse("2026-10-03T03:00:00Z"), ZoneId.of("Asia/Seoul"));
        clock = mockStatic(Clock.class, CALLS_REAL_METHODS);
        clock.when(Clock::systemDefaultZone).thenReturn(fixedClock);
    }

    @AfterEach
    void releaseClock() {
        clock.close();
    }

    @ParameterizedTest(name = "기존 생성 시각: {0}")
    @NullSource
    @MethodSource("resendEligibleCreationTimes")
    @DisplayName("생성 시각이 없거나 정확히 1분이 지난 코드는 재발급하여 인증에 사용할 수 있다")
    void eligibleResendReplacesTheLockedCodeAndInvalidatesItsProof(LocalDateTime previousCreationTime) {
        EmailVerification previous = verification(previousCreationTime, NOW.plusMinutes(4));
        previous.setVerificationTicketHash("old-proof");
        when(memberRepository.findByEmailAndDeletedAtIsNull(EMAIL)).thenReturn(Optional.empty());
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL))
                .thenReturn(Optional.of(previous));

        service.sendVerificationCode(EMAIL);

        InOrder delivery = inOrder(verificationRepository, emailService);
        ArgumentCaptor<EmailVerification> saved = ArgumentCaptor.forClass(EmailVerification.class);
        delivery.verify(verificationRepository).saveAndFlush(saved.capture());
        EmailVerification issued = saved.getValue();
        assertThat(issued).isSameAs(previous);
        assertThat(issued.getEmail()).isEqualTo(EMAIL);
        assertThat(issued.getVerificationCode()).matches("[0-9]{6}");
        assertThat(issued.getExpiresAt()).isEqualTo(LocalDateTime.of(2026, 10, 3, 12, 5));
        assertThat(issued.getVerified()).isFalse();
        assertThat(issued.getAttemptCount()).isZero();
        assertThat(issued.getVerificationTicketHash()).isNull();
        delivery.verify(emailService).sendVerificationEmail(EMAIL, issued.getVerificationCode());
        delivery.verifyNoMoreInteractions();

        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL))
                .thenReturn(Optional.of(issued));
        assertThat(service.verifyCode(EMAIL, issued.getVerificationCode())).isTrue();
        assertThat(issued.getVerified()).isTrue();
        verify(memberRepository).findByEmailAndDeletedAtIsNull(EMAIL);
        verify(verificationRepository, times(2)).findTopByEmailOrderByCreatedAtDesc(EMAIL);
        verify(verificationRepository).save(issued);
        verifyNoMoreInteractions(memberRepository, verificationRepository, emailService);
    }

    @Test
    @DisplayName("1분이 지나지 않은 재발송은 기존 코드를 보존하고 메일을 보내지 않는다")
    void recentCodeBlocksResendWithoutReplacingOrMailingIt() {
        EmailVerification previous = verification(NOW.minusSeconds(59), NOW.plusMinutes(4));
        when(memberRepository.findByEmailAndDeletedAtIsNull(EMAIL)).thenReturn(Optional.empty());
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL))
                .thenReturn(Optional.of(previous));

        assertThatThrownBy(() -> service.sendVerificationCode(EMAIL))
                .isInstanceOfSatisfying(EmailException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(exception).hasMessage("인증 코드를 이미 발송했어요. 1분 후 다시 시도해주세요.");
                });

        assertThat(previous.getVerificationCode()).isEqualTo(EXISTING_CODE);
        assertThat(previous.getVerified()).isFalse();
        assertThat(previous.getAttemptCount()).isEqualTo(2);
        verify(memberRepository).findByEmailAndDeletedAtIsNull(EMAIL);
        verify(verificationRepository).findTopByEmailOrderByCreatedAtDesc(EMAIL);
        verifyNoMoreInteractions(memberRepository, verificationRepository);
        verifyNoInteractions(emailService);
    }

    @Test
    @DisplayName("만료 시각을 지난 올바른 코드도 인증되지 않고 실패 횟수와 메일 상태를 보존한다")
    void expiredCorrectCodeCannotVerifyOrTriggerFurtherMail() {
        EmailVerification expired = verification(NOW.minusMinutes(6), NOW.minusNanos(1));
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.verifyCode(EMAIL, EXISTING_CODE))
                .isInstanceOfSatisfying(EmailException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.GONE);
                    assertThat(exception).hasMessage("인증 시간이 만료됐어요. 다시 요청해주세요.");
                });

        assertThat(expired.getVerified()).isFalse();
        assertThat(expired.getAttemptCount()).isEqualTo(2);
        verify(verificationRepository).findTopByEmailOrderByCreatedAtDesc(EMAIL);
        verifyNoMoreInteractions(verificationRepository);
        verifyNoInteractions(memberRepository, emailService);
    }

    @Test
    void verifiedProofKeepsTheOriginalExpiryAndIsConsumedOnce() throws Exception {
        EmailVerification verification = verification(NOW.minusMinutes(1), NOW.plusMinutes(4));
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL)).thenReturn(Optional.of(verification));

        var result = service.verifyCodeAndIssueTicket(EMAIL, EXISTING_CODE);
        assertThat(result.verificationTicket()).matches("[A-Za-z0-9_-]{43}");
        assertThat(result.expiresAt()).isEqualTo(NOW.plusMinutes(4).atZone(ZoneId.systemDefault()).toInstant());
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(result.verificationTicket().getBytes(StandardCharsets.US_ASCII)));
        assertThat(verification.getVerificationTicketHash()).isEqualTo(hash).isNotEqualTo(result.verificationTicket());

        service.consumeVerifiedEmail(EMAIL, result.verificationTicket());
        InOrder consumption = inOrder(verificationRepository);
        consumption.verify(verificationRepository).delete(verification);
        consumption.verify(verificationRepository).flush();
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.consumeVerifiedEmail(EMAIL, result.verificationTicket())).isInstanceOf(EmailException.class);
        verify(verificationRepository).delete(verification);
    }

    @Test
    void knowingTheEmailAloneCannotConsumeSomeoneElsesVerification() {
        EmailVerification verification = verification(NOW.minusMinutes(1), NOW.plusMinutes(4));
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL)).thenReturn(Optional.of(verification));
        service.verifyCodeAndIssueTicket(EMAIL, EXISTING_CODE);
        assertThatThrownBy(() -> service.consumeVerifiedEmail(EMAIL, "wrong".repeat(8) + "abc")).isInstanceOf(EmailException.class);
        verify(verificationRepository, org.mockito.Mockito.never()).delete(verification);
        assertThat(verification.getVerified()).isTrue();
    }

    @Test
    void aVerifiedEmailIsStillExpiredAtItsOriginalDeadline() {
        EmailVerification verification = verification(NOW.minusMinutes(5), NOW);
        verification.setVerified(true);
        when(verificationRepository.findByEmailAndVerifiedTrue(EMAIL)).thenReturn(Optional.of(verification));
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL)).thenReturn(Optional.of(verification));
        assertThat(service.isEmailVerified(EMAIL)).isFalse();
        assertThatThrownBy(() -> service.consumeVerifiedEmail(EMAIL, "a".repeat(43))).isInstanceOf(EmailException.class);
        verify(verificationRepository, org.mockito.Mockito.never()).delete(verification);
    }

    @Test
    void failedTicketVerificationCountsAttemptsAndStopsAtFive() {
        EmailVerification verification = verification(NOW.minusMinutes(1), NOW.plusMinutes(4));
        verification.setAttemptCount(0);
        when(verificationRepository.findTopByEmailOrderByCreatedAtDesc(EMAIL)).thenReturn(Optional.of(verification));
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> service.verifyCodeAndIssueTicket(EMAIL, "000000")).isInstanceOf(EmailException.class);
        }
        assertThat(verification.getAttemptCount()).isEqualTo(5);
        assertThatThrownBy(() -> service.verifyCodeAndIssueTicket(EMAIL, EXISTING_CODE)).isInstanceOf(EmailException.class);
        assertThat(verification.getVerified()).isFalse();
        assertThat(verification.getVerificationTicketHash()).isNull();
    }

    private static Stream<LocalDateTime> resendEligibleCreationTimes() {
        return Stream.of(NOW.minusMinutes(1));
    }

    private static EmailVerification verification(LocalDateTime createdAt, LocalDateTime expiresAt) {
        return EmailVerification.builder()
                .email(EMAIL)
                .verificationCode(EXISTING_CODE)
                .createdAt(createdAt)
                .expiresAt(expiresAt)
                .verified(false)
                .attemptCount(2)
                .build();
    }
}
