package kr.it.reserve.reservation.protection;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.RedisRequestLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReservationSubmissionProtectionTest {
    static final String REQUEST_ID = "11111111-1111-4111-8111-111111111111";
    private final TurnstileProperties properties = new TurnstileProperties();
    private final ReservationTurnstile turnstile = mock(ReservationTurnstile.class);

    @Test
    void challengesOnlyRepeatedRequestsAndVerifiesTheOriginalRequestNumber() {
        properties.setEnabled(true);
        properties.setSiteKey("test-site");
        var protection = new ReservationSubmissionProtection(new RateLimiter(), properties, turnstile);
        for (int i = 0; i < RateLimiter.Policy.RESERVATION_CHALLENGE_THRESHOLD.capacity(); i++) {
            assertThat(protection.check(7L, "192.0.2.10", REQUEST_ID, null)).isNull();
        }
        var challenge = protection.check(7L, "192.0.2.10", REQUEST_ID, null);
        assertThat(challenge.requestId()).isEqualTo(REQUEST_ID);
        assertThat(challenge.action()).isEqualTo(ReservationTurnstile.ACTION);
        verifyNoInteractions(turnstile);

        when(turnstile.verify("sample-proof", REQUEST_ID)).thenReturn(true);
        assertThat(protection.check(7L, "192.0.2.10", REQUEST_ID, "sample-proof")).isNull();
        assertThatThrownBy(() -> protection.check(7L, "192.0.2.10", REQUEST_ID, "sample-proof"))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        verify(turnstile).verify("sample-proof", REQUEST_ID);
    }

    @Test
    void memberLimitCoversSeparateAddressesAndMaintainsAFiniteFallback() {
        var shared = mock(RedisRequestLimiter.class);
        var used = new AtomicInteger();
        var policy = RateLimiter.Policy.RESERVATION_MEMBER_CREATE;
        when(shared.tryConsume(eq("member:7"), eq(policy), anyInt(), any()))
                .thenAnswer(invocation -> used.incrementAndGet() <= policy.capacity());
        RateLimiter first = sharedLimiter(shared);
        RateLimiter second = sharedLimiter(shared);
        var firstInstance = new ReservationSubmissionProtection(first, properties, turnstile);
        var secondInstance = new ReservationSubmissionProtection(second, properties, turnstile);
        for (int i = 0; i < policy.capacity(); i++) {
            var instance = i % 2 == 0 ? firstInstance : secondInstance;
            assertThat(instance.check(7L, "192.0.2.1" + i, REQUEST_ID, null)).isNull();
        }
        assertThatThrownBy(() -> secondInstance.check(7L, "192.0.2.25", REQUEST_ID, null))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        when(shared.tryConsume(eq("member:7"), eq(policy), anyInt(), any())).thenReturn(null);
        for (int i = 0; i < policy.capacity() / 2; i++) {
            assertThat(secondInstance.check(7L, "192.0.2.2" + i, REQUEST_ID, null)).isNull();
        }
        assertThatThrownBy(() -> secondInstance.check(7L, "192.0.2.29", REQUEST_ID, null))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        verifyNoInteractions(turnstile);
    }

    private static RateLimiter sharedLimiter(RedisRequestLimiter shared) {
        var limiter = new RateLimiter();
        ReflectionTestUtils.setField(limiter, "sharedWaitingLimits", shared);
        ReflectionTestUtils.setField(limiter, "shareReservationLimits", true);
        return limiter;
    }
}
