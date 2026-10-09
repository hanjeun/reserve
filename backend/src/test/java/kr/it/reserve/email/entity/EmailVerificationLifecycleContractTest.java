package kr.it.reserve.email.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.MockedStatic;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockStatic;

class EmailVerificationLifecycleContractTest {

    private static final String CODE = "123456";
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime ISSUED_AT = LocalDateTime.of(2026, 10, 3, 12, 0);
    private static final LocalDateTime EXPIRES_AT = LocalDateTime.of(2026, 10, 3, 12, 5);

    @ParameterizedTest(name = "검증 시각: {0}, 인증 가능: {1}")
    @MethodSource("expiryBoundaryCases")
    @DisplayName("저장 시 생성 시각을 기록하고 만료 시각부터 인증을 거절한다")
    void persistedCodeHonorsTheExactExpiryBoundary(LocalDateTime checkedAt, boolean accepted) {
        Clock issuedClock = Clock.fixed(Instant.parse("2026-10-03T03:00:00Z"), ZONE);
        Clock checkedClock = Clock.fixed(checkedAt.atZone(ZONE).toInstant(), ZONE);
        EmailVerification verification = EmailVerification.builder()
                .email("verification@example.com")
                .verificationCode(CODE)
                .expiresAt(EXPIRES_AT)
                .build();

        try (MockedStatic<Clock> clock = mockStatic(Clock.class)) {
            clock.when(Clock::systemDefaultZone).thenReturn(issuedClock);
            verification.onCreate();
            assertThat(verification.getCreatedAt()).isEqualTo(ISSUED_AT);
            assertThat(verification.getVerified()).isFalse();

            clock.when(Clock::systemDefaultZone).thenReturn(checkedClock);
            assertThat(verification.verify(CODE)).isEqualTo(accepted);
            assertThat(verification.getVerified()).isEqualTo(accepted);
        }
    }

    private static Stream<Arguments> expiryBoundaryCases() {
        return Stream.of(
                Arguments.of(EXPIRES_AT.minusNanos(1), true),
                Arguments.of(EXPIRES_AT, false),
                Arguments.of(EXPIRES_AT.plusNanos(1), false));
    }
}
