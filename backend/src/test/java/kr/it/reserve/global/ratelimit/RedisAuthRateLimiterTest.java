package kr.it.reserve.global.ratelimit;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SuppressWarnings({"unchecked", "rawtypes"})
class RedisAuthRateLimiterTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final RedisFailureBackoff backoff = new RedisFailureBackoff();
    private RedisAuthRateLimiter shared;
    private RateLimiter limiter;
    static AuthRateLimitProperties properties() {
        var value = new AuthRateLimitProperties();
        value.setEnabled(true); value.setFingerprintKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="); value.setEpoch("synthetic-v1");
        return value;
    }
    @BeforeEach void setup() {
        shared = new RedisAuthRateLimiter(redis, RedisNamespace.LOCAL, backoff, properties());
        limiter = new RateLimiter();
        ReflectionTestUtils.setField(limiter, "sharedAuthenticationLimits", shared);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(1L);
    }
    @AfterEach void cleanup() { RequestContextHolder.resetRequestAttributes(); }

    @Test void rawAccountAndIpNeverAppearInRedisKeysAndNamespaceAndEpochStayDistinct() {
        var keys = org.mockito.ArgumentCaptor.forClass(List.class);
        shared.consume("synthetic@example.test", RateLimiter.Policy.LOGIN_ACCOUNT);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertThat(keys.getValue().toString()).startsWith("[reserve:local:auth-limits:v1:{").doesNotContain("synthetic@", "example.test");
        clearInvocations(redis);
        var properties = properties(); properties.setEpoch("synthetic-v2");
        new RedisAuthRateLimiter(redis, RedisNamespace.PRODUCTION, backoff, properties).consume("synthetic@example.test", RateLimiter.Policy.LOGIN_ACCOUNT);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertThat(keys.getAllValues().get(0).get(0)).isNotEqualTo(keys.getAllValues().get(1).get(0));
        assertThat(keys.getValue().toString()).startsWith("[reserve:prod:");
    }
    @Test void sharedDenialDoesNotUseOrAllocateLocalAuthenticationBuckets() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(0L);
        assertThat(limiter.tryConsume("account", RateLimiter.Policy.LOGIN_ACCOUNT)).isFalse();
        assertThat((java.util.Map<?, ?>) ReflectionTestUtils.getField(limiter, "buckets")).isEmpty();
    }
    @Test void aSuccessfulRequestCanReturnOnlyItsOwnReceiptOnce() {
        assertThat(limiter.tryConsume("account", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        limiter.refund("another-account", RateLimiter.Policy.LOGIN_ACCOUNT);
        limiter.refund("account", RateLimiter.Policy.LOGIN_ACCOUNT);
        limiter.refund("account", RateLimiter.Policy.LOGIN_ACCOUNT);
        verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }
    @Test void aLaterRequestCannotReturnTheEarlierRequestReceipt() {
        assertThat(limiter.tryConsume("account", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        limiter.refund("account", RateLimiter.Policy.LOGIN_ACCOUNT);
        verify(redis).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }
    @Test void outageRejectsNewAuthenticationWithoutFallingBackOrLeakingDiagnostics() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenThrow(new IllegalStateException("synthetic-private-diagnostic"));
        assertThatThrownBy(() -> limiter.tryConsume("account", RateLimiter.Policy.LOGIN_ACCOUNT))
                .isInstanceOf(RedisAuthRateLimiter.Unavailable.class).hasMessageNotContaining("synthetic-private-diagnostic");
        assertThat(backoff.available()).isFalse();
        assertThat((java.util.Map<?, ?>) ReflectionTestUtils.getField(limiter, "buckets")).isEmpty();
    }
    @Test void recoveryWaitDoesNotMarkOtherRedisOperationsUnavailable() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(-600L);
        var unavailable = catchThrowableOfType(() -> shared.consume("account", RateLimiter.Policy.LOGIN_ACCOUNT), RedisAuthRateLimiter.Unavailable.class);
        assertThat(unavailable.retrySeconds()).isEqualTo(600);
        assertThat(backoff.available()).isTrue();
    }
    @Test void anUnconfirmedRefundKeepsTheChargeAndDoesNotUndoSuccessfulAuthentication() {
        assertThat(limiter.tryConsume("account", RateLimiter.Policy.LOGIN_ACCOUNT)).isTrue();
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenThrow(new IllegalStateException("unavailable"));
        assertThatCode(() -> limiter.refund("account", RateLimiter.Policy.LOGIN_ACCOUNT)).doesNotThrowAnyException();
    }
    @Test void cancelAndLifecycleReadsKeepTheirExistingGates() {
        assertThat(shared.supports(RateLimiter.Policy.MFA_CANCEL)).isFalse();
        assertThat(shared.supports(RateLimiter.Policy.MFA_LIFECYCLE)).isFalse();
        assertThat(shared.supports(RateLimiter.Policy.WAITING_JOIN)).isFalse();
        assertThat(shared.supports(RateLimiter.Policy.QR_CHECKIN)).isFalse();
    }
}
