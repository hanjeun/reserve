package kr.it.reserve.global.admission;

import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SuppressWarnings({"unchecked", "rawtypes"})
class ServiceAdmissionServiceTest {
    private static final String TICKET = "11111111-1111-4111-8111-111111111111";
    private final ObjectProvider<StringRedisTemplate> redisProvider = mock(ObjectProvider.class);
    private final ObjectProvider<RedisNamespace> namespaceProvider = mock(ObjectProvider.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private ServiceAdmissionProperties properties;
    private ServiceAdmissionService service;

    @BeforeEach
    void prepare() {
        properties = new ServiceAdmissionProperties();
        service = new ServiceAdmissionService(properties, redisProvider, namespaceProvider);
    }

    @Test
    void defaultOffNeverRequiresRedisOrCreatesATicket() {
        properties.validate();
        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.getCapacity()).isEqualTo(20);
        assertThat(properties.getMaxWaiting()).isEqualTo(1000);
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        assertThat(service.join(null).state()).isEqualTo("BYPASS");
        assertThat(service.join(TICKET).ticket()).isNull();
        assertThat(service.status(null).mode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        assertThat(service.cancel(TICKET).state()).isEqualTo("BYPASS");
        assertThat(service.admitted(null)).isTrue();
        properties.getAutomatic().setEnabled(true);
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.HIGH);
        verifyNoInteractions(redisProvider, namespaceProvider, redis);
    }

    @Test
    void enabledMissingRedisOrNamespaceFailsClosed() {
        enable();
        when(redisProvider.getIfAvailable()).thenReturn(null);
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(namespaceProvider.getIfAvailable()).thenReturn(null);
        assertThatThrownBy(() -> service.admitted(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
    }

    @Test
    void redisFailureDoesNotBecomeAnOffOrAdmittedResponse() {
        enable();
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenThrow(new RedisConnectionFailureException("Synthetic unavailable Redis"));
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThatThrownBy(() -> service.admitted(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"OFF", "CORE", "EMERGENCY"})
    void eachRoutingModeIsCachedForAtMostOneSecond(String mode) {
        enable();
        var ticks = new AtomicLong();
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        response("MODE", "", 0, mode);
        var expected = ServiceAdmissionService.Mode.valueOf(mode);
        assertThat(service.currentMode()).isEqualTo(expected);
        response("MODE", "", 0, "CORE".equals(mode) ? "EMERGENCY" : "CORE");
        ticks.set(TimeUnit.SECONDS.toNanos(1) - 1);
        assertThat(service.currentMode()).isEqualTo(expected);
        verify(redis, times(1)).execute(any(RedisScript.class), anyList(), any(Object[].class));
        ticks.incrementAndGet();
        assertThat(service.currentMode()).isNotEqualTo(expected);
        verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void failedModeReloadDropsTheExpiredSnapshotAndRecoveryReadsRedisAgain() {
        enable();
        var ticks = new AtomicLong();
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        response("MODE", "", 0, "OFF");
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        ticks.set(TimeUnit.SECONDS.toNanos(1));
        doThrow(new RedisConnectionFailureException("Synthetic unavailable Redis")).when(redis)
                .execute(any(RedisScript.class), anyList(), any(Object[].class));
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        response("MODE", "", 0, "EMERGENCY");
        ticks.set(TimeUnit.SECONDS.toNanos(6) - 1);
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
        ticks.incrementAndGet();
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        verify(redis, times(3)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void failedRedisReadInvalidatesEvenAFreshCachedOffModeAndNeverCachesAuthority() {
        enable();
        response("MODE", "", 0, "OFF");
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        doThrow(new RedisConnectionFailureException("Synthetic unavailable Redis")).when(redis)
                .execute(any(RedisScript.class), anyList(), any(Object[].class));
        assertThatThrownBy(() -> service.status(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThatThrownBy(() -> service.admitted(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void onlyOneRecoveryProbeCanUseRedisWhileConcurrentRequestsFailImmediately() throws Exception {
        enable();
        var ticks = new AtomicLong();
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        doThrow(new RedisConnectionFailureException("Synthetic unavailable Redis")).when(redis)
                .execute(any(RedisScript.class), anyList(), any(Object[].class));
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        ticks.set(TimeUnit.SECONDS.toNanos(5));
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return List.of("ADMITTED", TICKET, "0", "1893456900000", "1893463200000", "1893456000000", "CORE");
        }).when(redis).execute(any(RedisScript.class), anyList(), any(Object[].class));
        try (var executor = Executors.newSingleThreadExecutor()) {
            var probe = executor.submit(() -> service.admitted(TICKET));
            try {
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
                assertThatThrownBy(() -> service.join(null)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
                verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
            } finally { release.countDown(); }
            assertThat(probe.get(2, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(service.status(TICKET).state()).isEqualTo("ADMITTED");
        verify(redis, times(3)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void aFailedRecoveryProbeStartsAnotherFiveSecondFailClosedWindow() {
        enable();
        var ticks = new AtomicLong();
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        doThrow(new RedisConnectionFailureException("Synthetic unavailable Redis")).when(redis)
                .execute(any(RedisScript.class), anyList(), any(Object[].class));
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        ticks.set(TimeUnit.SECONDS.toNanos(5));
        assertThatThrownBy(() -> service.status(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        ticks.set(TimeUnit.SECONDS.toNanos(10) - 1);
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        verify(redis, times(2)).execute(any(RedisScript.class), anyList(), any(Object[].class));
        ticks.incrementAndGet();
        response("MODE", "", 0, "EMERGENCY");
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        verify(redis, times(3)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void recentEmergencyThrottlesHoldClearUntilFifteenQuietSecondsWithoutExtraRedisWork() {
        enable();
        properties.getAutomatic().setEnabled(true);
        var ticks = new AtomicLong();
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        var signals = automaticSignals("EMERGENCY");
        service.noteEmergencyThrottle();
        verifyNoInteractions(redis);
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        ticks.set(TimeUnit.SECONDS.toNanos(14));
        service.noteEmergencyThrottle();
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        ticks.set(TimeUnit.SECONDS.toNanos(29) - 1);
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        ticks.incrementAndGet();
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        assertThat(signals).containsExactly("HOLD", "HOLD", "HOLD", "CLEAR");
        verify(redis, times(4)).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    void rejectionEvidenceNeverCreatesHighOrSuppressesObservedHighAndUnknown() {
        enable();
        properties.getAutomatic().setEnabled(true);
        var signals = automaticSignals("CORE");
        service.noteEmergencyThrottle();
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.HIGH);
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.UNKNOWN);
        assertThat(signals).containsExactly("HOLD", "HIGH", "UNKNOWN");
    }

    @Test
    void disabledAutomaticObservationDoesNotEvenReadTheThrottleClock() {
        var clock = mock(LongSupplier.class);
        ReflectionTestUtils.setField(service, "nanoTime", clock);
        properties.getAutomatic().setEnabled(true);
        service.noteEmergencyThrottle();
        properties.setEnabled(true);
        properties.getAutomatic().setEnabled(false);
        service.noteEmergencyThrottle();
        verifyNoInteractions(clock, redisProvider, namespaceProvider, redis);
    }

    @Test
    void aLateOlderThrottleCannotShortenTheQuietPeriodAndClockRegressionCannotClearIt() {
        enable();
        properties.getAutomatic().setEnabled(true);
        var ticks = new AtomicLong(TimeUnit.SECONDS.toNanos(2));
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        var signals = automaticSignals("EMERGENCY");
        service.noteEmergencyThrottle();
        ticks.set(TimeUnit.SECONDS.toNanos(1));
        service.noteEmergencyThrottle();
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        ticks.set(TimeUnit.SECONDS.toNanos(16));
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        ticks.set(TimeUnit.SECONDS.toNanos(17));
        service.observeAutomatic(TICKET, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        assertThat(signals).containsExactly("HOLD", "HOLD", "CLEAR");
    }

    @ParameterizedTest
    @CsvSource({"10,90,4", "11,90,10", "100,90,10", "101,90,20", "101,30,10", "101,59,19"})
    void waitingPollPolicyIsRankBasedAndBoundedByTheHeartbeatBudget(long position, int timeout, int interval) {
        enable();
        properties.setHeartbeatTimeoutSeconds(timeout);
        properties.validate();
        response("WAITING", TICKET, position, "CORE");
        var entry = service.status(TICKET);
        assertThat(entry.pollAfterSeconds()).isEqualTo(interval).isLessThanOrEqualTo(timeout / 3);
        assertThat(entry.heartbeatTimeoutSeconds()).isEqualTo(timeout);
        assertThat(entry.mode()).isEqualTo(ServiceAdmissionService.Mode.CORE);
    }

    @ParameterizedTest
    @CsvSource({"10,90,8", "11,90,20", "101,90,30", "101,30,10"})
    void emergencyWaitingPollIsSlowerAndStillPreservesHeartbeat(long position, int timeout, int interval) {
        enable();
        properties.setHeartbeatTimeoutSeconds(timeout);
        response("WAITING", TICKET, position, "EMERGENCY");
        var entry = service.status(TICKET);
        assertThat(entry.pollAfterSeconds()).isEqualTo(interval).isLessThanOrEqualTo(timeout / 3);
    }

    @ParameterizedTest
    @CsvSource({"30,10", "900,60", "86400,60"})
    void admittedBrowsersReceiveTheSlowerPollAndTheirSlidingBudget(int sessionSeconds, int interval) {
        enable();
        properties.setSessionSeconds(sessionSeconds);
        properties.setMaxSessionSeconds(Math.max(sessionSeconds, properties.getMaxSessionSeconds()));
        properties.validate();
        response("ADMITTED", TICKET, 0, "EMERGENCY");
        var entry = service.status(TICKET);
        assertThat(entry.pollAfterSeconds()).isEqualTo(interval);
        assertThat(entry.heartbeatTimeoutSeconds()).isEqualTo(sessionSeconds);
        assertThat(entry.mode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        assertThat(entry.toString()).doesNotContain(TICKET);
    }

    @Test
    void missingOrInvalidControlResponseCannotOpenTheGate() {
        enable();
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(List.of("UNAVAILABLE"));
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        response("ADMITTED", TICKET, 0, "UNKNOWN");
        assertThatThrownBy(() -> service.admitted(TICKET)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
    }

    @ParameterizedTest
    @CsvSource({"capacity,0", "session,29", "hard,899", "heartbeat,29", "waiting,0", "epoch,invalid"})
    void invalidEnabledCapacityOrLifetimeConfigurationIsRejected(String field, String value) {
        enable();
        switch (field) {
            case "capacity" -> properties.setCapacity(Integer.parseInt(value));
            case "session" -> properties.setSessionSeconds(Integer.parseInt(value));
            case "hard" -> properties.setMaxSessionSeconds(Integer.parseInt(value));
            case "heartbeat" -> properties.setHeartbeatTimeoutSeconds(Integer.parseInt(value));
            case "waiting" -> properties.setMaxWaiting(Integer.parseInt(value));
            case "epoch" -> properties.setEpoch(value);
            default -> throw new AssertionError(field);
        }
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void markerChangesWithStateIdentityButNotTheLocalEnableSwitch() {
        enable();
        String marker = ServiceAdmissionService.marker(properties);
        properties.setEnabled(false);
        assertThat(ServiceAdmissionService.marker(properties)).isEqualTo(marker);
        properties.getAutomatic().setEnabled(true);
        properties.getAutomatic().setMemoryPressureMib(64);
        assertThat(ServiceAdmissionService.marker(properties)).isEqualTo(marker);
        int originalCapacity = properties.getCapacity();
        properties.setCapacity(101);
        assertThat(ServiceAdmissionService.marker(properties)).isNotEqualTo(marker);
        properties.setCapacity(originalCapacity);
        assertThat(ServiceAdmissionService.marker(properties)).isEqualTo(marker);
        properties.setEpoch("22222222-2222-4222-8222-222222222222");
        assertThat(ServiceAdmissionService.marker(properties)).isNotEqualTo(marker);
    }

    private void enable() {
        properties.setEnabled(true);
        properties.setEpoch("11111111-1111-4111-8111-111111111111");
        properties.validate();
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(namespaceProvider.getIfAvailable()).thenReturn(RedisNamespace.LOCAL);
    }

    private void response(String state, String ticket, long position, String mode) {
        doReturn(List.of(state, ticket, Long.toString(position), "1893456900000", "1893463200000", "1893456000000", mode))
                .when(redis).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    private List<String> automaticSignals(String mode) {
        var signals = new ArrayList<String>();
        doAnswer(call -> {
            signals.add(((Object[]) call.getRawArguments()[2])[2].toString());
            return List.of("MODE", "", "0", "0", "0", "1893456000000", mode);
        }).when(redis).execute(any(RedisScript.class), anyList(), any(Object[].class));
        return signals;
    }
}
