package kr.it.reserve.global.admission;

import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.*;

/** Owns a disposable loopback Redis. It never opens or flushes the application's Redis. */
@EnabledIfEnvironmentVariable(named = "RESERVE_ADMISSION_REDIS_TEST", matches = "1")
@Timeout(45)
class ServiceAdmissionRedisIntegrationTest {
    private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
    private static final String NAME = "reserve-service-entry-test-" + UUID.randomUUID().toString().substring(0, 8);
    private static final List<String> SUFFIXES = List.of("control", "waiting", "active", "heartbeats", "born", "sequence");
    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate redis;
    private static boolean owned;
    private ServiceAdmissionProperties properties;
    private ServiceAdmissionService service;
    private String prefix;
    private final AtomicLong ticks = new AtomicLong();

    private static String ownerLabel() {
        String owner = System.getenv("RESERVE_ISOLATED_TEST_OWNER");
        if (owner != null && !owner.matches("[0-9a-f]{32}")) throw new IllegalArgumentException("Invalid isolated fixture owner");
        return owner == null ? NAME : owner;
    }

    @BeforeAll
    static void start() throws Exception {
        command(null, "run", "--pull=never", "--rm", "-d", "--name", NAME, "--label", "kr.it.reserve.isolated-test-owner=" + ownerLabel(), "--user", "999:999", "--read-only",
                "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=128m", "--pids-limit=64",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999", "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "-p", "127.0.0.1::6379", IMAGE, "sh", "-c", "while [ ! -f /tmp/test.conf ]; do sleep 0.1; done; exec redis-server /tmp/test.conf");
        owned = true;
        String password = UUID.randomUUID().toString() + UUID.randomUUID();
        command("bind 0.0.0.0\nprotected-mode yes\nrequirepass " + password + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n",
                "exec", "-i", NAME, "sh", "-c", "umask 077; cat > /tmp/test.next && mv /tmp/test.next /tmp/test.conf");
        String port = command(null, "port", NAME, "6379/tcp").trim();
        assertThat(port).matches("127\\.0\\.0\\.1:[0-9]+");
        var configuration = new org.springframework.data.redis.connection.RedisStandaloneConfiguration("127.0.0.1", Integer.parseInt(port.substring(port.lastIndexOf(':') + 1)));
        configuration.setPassword(password);
        factory = new LettuceConnectionFactory(configuration);
        factory.afterPropertiesSet();
        factory.start();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        for (int i = 0; i < 50; i++) {
            try (var connection = factory.getConnection()) { if ("PONG".equals(connection.ping())) return; }
            catch (RuntimeException ignored) { Thread.sleep(50); }
        }
        throw new IllegalStateException("Disposable service-admission Redis did not start");
    }

    @AfterAll
    static void stop() throws Exception {
        try { if (factory != null) factory.destroy(); }
        finally { if (owned) command(null, "stop", NAME); }
    }

    @BeforeEach
    void prepare() {
        properties = new ServiceAdmissionProperties();
        properties.setEnabled(true);
        properties.setCapacity(1);
        properties.setEpoch(UUID.randomUUID().toString());
        properties.validate();
        var beans = new StaticListableBeanFactory();
        beans.addBean("redis", redis);
        beans.addBean("scope", RedisNamespace.LOCAL);
        service = new ServiceAdmissionService(properties, beans.getBeanProvider(StringRedisTemplate.class),
                beans.getBeanProvider(RedisNamespace.class));
        ReflectionTestUtils.setField(service, "nanoTime", (LongSupplier) ticks::get);
        prefix = service.prefix();
        redis.delete(SUFFIXES.stream().map(suffix -> prefix + suffix).toList());
        control("CORE");
    }

    @Test
    void capacityAndFifoArePreservedWhileLiveCookiesReuseTheirTicket() {
        var first = service.join(null);
        var second = service.join(null);
        var third = service.join(null);
        assertThat(first.state()).isEqualTo("ADMITTED");
        assertThat(second.state()).isEqualTo("WAITING");
        assertThat(second.position()).isEqualTo(1);
        assertThat(third.position()).isEqualTo(2);
        assertThat(service.join(second.ticket()).ticket()).isEqualTo(second.ticket());
        assertThat(service.join(first.ticket()).ticket()).isEqualTo(first.ticket());
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(1);
        assertThat(redis.opsForZSet().zCard(prefix + "waiting")).isEqualTo(2);
        var cancelled = service.cancel(first.ticket());
        assertThat(cancelled.state()).isEqualTo("CANCELLED");
        assertThat(cancelled.ticket()).isNull();
        var admitted = service.status(second.ticket());
        assertThat(admitted.state()).isEqualTo("ADMITTED");
        assertThat(admitted.pollAfterSeconds()).isEqualTo(60);
        assertThat(admitted.heartbeatTimeoutSeconds()).isEqualTo(900);
        assertThat(service.status(third.ticket()).position()).isEqualTo(1);
    }

    @Test
    void fullWaitingQueueDoesNotCreateAnExtraPass() {
        properties.setMaxWaiting(1);
        control("CORE");
        service.join(null);
        service.join(null);
        var full = service.join(null);
        assertThat(full.state()).isEqualTo("FULL");
        assertThat(full.ticket()).isNull();
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(1);
        assertThat(redis.opsForZSet().zCard(prefix + "waiting")).isEqualTo(1);
    }

    @Test
    void anExpiredWaitingTailIsNeverRenewedAndOnlyExplicitJoinCanReplaceIt() {
        service.join(null);
        for (int i = 1; i <= 150; i++) {
            redis.opsForZSet().add(prefix + "waiting", ticket(i), i);
            redis.opsForZSet().add(prefix + "heartbeats", ticket(i), 1);
        }
        String old = ticket(150);
        var expired = service.status(old);
        assertThat(expired.state()).isEqualTo("EXPIRED");
        assertThat(expired.ticket()).isNull();
        assertThat(redis.opsForZSet().score(prefix + "heartbeats", old)).isNull();
        assertThat(redis.opsForZSet().zCard(prefix + "waiting")).isEqualTo(49);
        var replacement = service.join(old);
        assertThat(replacement.state()).isEqualTo("WAITING");
        assertThat(replacement.ticket()).isNotEqualTo(old);
        assertThat(replacement.position()).isEqualTo(1);
        assertThat(replacement.absoluteExpiresAt()).isZero();
        assertThat(replacement.expiresAt()).isGreaterThan(replacement.serverTime());
    }

    @Test
    void checkNeverScansOrRevivesExpiredActiveTicketsBeyondTheCleanupBatch() {
        properties.setCapacity(200);
        control("CORE");
        long now = now();
        for (int i = 1; i <= 150; i++) {
            redis.opsForZSet().add(prefix + "active", ticket(i), 1);
            redis.opsForHash().put(prefix + "born", ticket(i), Long.toString(now - 1000));
        }
        String old = ticket(150);
        assertThat(service.admitted(old)).isFalse();
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(150);
        assertThat(redis.opsForZSet().score(prefix + "active", old)).isEqualTo(1);
        assertThat(service.status(old).state()).isEqualTo("EXPIRED");
        assertThat(redis.opsForZSet().score(prefix + "active", old)).isNull();
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(49);
    }

    @Test
    void admittedActivitySlidesOnlyWithinItsOriginalHardDeadline() {
        var first = service.join(null);
        long now = now();
        redis.opsForZSet().add(prefix + "active", first.ticket(), now + 300000);
        var renewed = service.status(first.ticket());
        assertThat(renewed.expiresAt()).isGreaterThan(now + 300000);
        assertThat(renewed.absoluteExpiresAt()).isEqualTo(first.absoluteExpiresAt());

        long born = now() - properties.getMaxSessionSeconds() * 1000L + 30000;
        long absolute = born + properties.getMaxSessionSeconds() * 1000L;
        redis.opsForHash().put(prefix + "born", first.ticket(), Long.toString(born));
        redis.opsForZSet().add(prefix + "active", first.ticket(), now() + 120000);
        var bounded = service.status(first.ticket());
        assertThat(bounded.absoluteExpiresAt()).isEqualTo(absolute);
        assertThat(bounded.expiresAt()).isEqualTo(absolute);
        assertThat(service.admitted(first.ticket())).isTrue();
        assertThat(redis.opsForZSet().score(prefix + "active", first.ticket())).isEqualTo((double) absolute);

        redis.opsForHash().put(prefix + "born", first.ticket(), Long.toString(now() - properties.getMaxSessionSeconds() * 1000L - 1));
        redis.opsForZSet().add(prefix + "active", first.ticket(), now() + 120000);
        assertThat(service.admitted(first.ticket())).isFalse();
        assertThat(service.status(first.ticket()).state()).isEqualTo("EXPIRED");
        assertThat(service.status(first.ticket()).ticket()).isNull();
        assertThat(service.join(first.ticket()).ticket()).isNotEqualTo(first.ticket());
    }

    @Test
    void checkDoesNotJoinPromoteOrKeepAWaitingHeartbeatAlive() {
        var first = service.join(null);
        var waiting = service.join(null);
        Double heartbeat = redis.opsForZSet().score(prefix + "heartbeats", waiting.ticket());
        String sequence = redis.opsForValue().get(prefix + "sequence");
        redis.opsForZSet().add(prefix + "active", first.ticket(), 1);
        assertThat(service.admitted(waiting.ticket())).isFalse();
        assertThat(service.admitted(null)).isFalse();
        assertThat(redis.opsForZSet().score(prefix + "heartbeats", waiting.ticket())).isEqualTo(heartbeat);
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(1);
        assertThat(redis.opsForZSet().zCard(prefix + "waiting")).isEqualTo(1);
        assertThat(redis.opsForHash().get(prefix + "born", waiting.ticket())).isNull();
        assertThat(redis.opsForValue().get(prefix + "sequence")).isEqualTo(sequence);
        assertThat(service.status(waiting.ticket()).state()).isEqualTo("ADMITTED");
    }

    @Test
    void modeChangesPreservePassIdentityAndOffCreatesNoState() {
        var first = service.join(null);
        control("EMERGENCY");
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        assertThat(service.admitted(first.ticket())).isTrue();
        assertThat(service.status(first.ticket()).ticket()).isEqualTo(first.ticket());
        Double deadline = redis.opsForZSet().score(prefix + "active", first.ticket());
        control("OFF");
        assertThat(service.admitted(null)).isTrue();
        assertThat(service.status(first.ticket()).mode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        ticks.addAndGet(TimeUnit.SECONDS.toNanos(1));
        assertThat(service.currentMode()).isEqualTo(ServiceAdmissionService.Mode.OFF);
        assertThat(service.join(null).state()).isEqualTo("BYPASS");
        assertThat(service.join(null).ticket()).isNull();
        assertThat(redis.opsForZSet().score(prefix + "active", first.ticket())).isEqualTo(deadline);
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isEqualTo(1);
        control("CORE");
        assertThat(service.admitted(first.ticket())).isTrue();
    }

    @Test
    void missingMismatchedOrInvalidControlFailsClosedWithoutInitialization() {
        var first = service.join(null);
        redis.delete(prefix + "control");
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThatThrownBy(() -> service.join(null)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThatThrownBy(() -> service.admitted(first.ticket())).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        assertThat(redis.hasKey(prefix + "control")).isFalse();
        redis.opsForHash().putAll(prefix + "control", Map.of("marker", "wrong", "mode", "CORE"));
        assertThatThrownBy(() -> service.status(first.ticket())).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        control("UNKNOWN");
        assertThatThrownBy(service::currentMode).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
    }

    @Test
    void missingAndMalformedStatusNeverCreatesATicket() {
        assertThat(service.status(null).state()).isEqualTo("NOT_JOINED");
        assertThat(service.status("bad-cookie").state()).isEqualTo("EXPIRED");
        assertThat(service.status(UUID.randomUUID().toString()).ticket()).isNull();
        assertThat(redis.opsForZSet().zCard(prefix + "waiting")).isZero();
        assertThat(redis.opsForZSet().zCard(prefix + "active")).isZero();
    }

    @Test
    void automaticPressureAndRecoveryUseHysteresisWithoutChangingAnyPassState() {
        var first = service.join(null);
        service.join(null);
        var before = passSnapshot();
        String owner = UUID.randomUUID().toString();
        long start = now();
        for (int i = 0; i < 6; i++) assertThat(automatic("HIGH", owner, start + i * 5000).get(6)).isEqualTo("CORE");
        assertThat(automatic("HIGH", owner, start + 30000).get(6)).isEqualTo("EMERGENCY");
        assertThat(service.status(null).mode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        for (int i = 0; i < 24; i++) assertThat(automatic("CLEAR", owner, start + 35000 + i * 5000).get(6)).isEqualTo("EMERGENCY");
        assertThat(automatic("CLEAR", owner, start + 155000).get(6)).isEqualTo("CORE");
        assertThat(passSnapshot()).isEqualTo(before);
        assertThat(service.status(first.ticket()).absoluteExpiresAt()).isEqualTo(first.absoluteExpiresAt());
    }

    @Test
    void unknownObservationBreaksRecoveryAndTheFirstHealthySampleCannotCountThePriorUnknownPeriod() {
        String owner = UUID.randomUUID().toString();
        long start = now();
        seedAutomatic(owner, "EMERGENCY", start, 0, 115000, 115000, "CLEAR");
        assertThat(automatic("UNKNOWN", owner, start + 5000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("0");
        assertThat(automatic("CLEAR", owner, start + 10000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("0");
        properties.getAutomatic().setMinimumEmergencySeconds(300);
        seedAutomatic(owner, "EMERGENCY", start, 0, 115000, 115000, "CLEAR");
        assertThat(automatic("CLEAR", owner, start + 5000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("120000");
    }

    @Test
    void blueGreenWriterLeasePreventsOtherSamplesFromResettingEvidenceAndHandoverPreservesEmergency() {
        String first = UUID.randomUUID().toString(), second = UUID.randomUUID().toString();
        long start = now();
        seedAutomatic(first, "EMERGENCY", start, 0, 100000, 100000, "CLEAR");
        var before = redis.opsForHash().entries(prefix + "control");
        assertThat(automatic("HIGH", second, start + 5000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().entries(prefix + "control")).isEqualTo(before);
        assertThat(automatic("CLEAR", second, start + 25000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoOwner")).isEqualTo(second);
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("0");
        before = redis.opsForHash().entries(prefix + "control");
        automatic("CLEAR", first, start + 26000);
        assertThat(redis.opsForHash().entries(prefix + "control")).isEqualTo(before);
    }

    @Test
    void gapsClockJumpsAndClockRegressionCannotSupplyRecoveryEvidence() {
        String owner = UUID.randomUUID().toString();
        long start = now();
        seedAutomatic(owner, "EMERGENCY", start, 0, 115000, 115000, "CLEAR");
        assertThat(automatic("CLEAR", owner, start + 300000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("0");
        assertThat(redis.opsForHash().get(prefix + "control", "autoEmergencyMs")).isEqualTo("0");
        assertThat(automatic("CLEAR", owner, start + 299000).get(6)).isEqualTo("EMERGENCY");
        assertThat(redis.opsForHash().get(prefix + "control", "autoClearMs")).isEqualTo("0");
    }

    @Test
    void malformedAutomaticMetadataFailsClosedButManualOffAndEmergencyAlwaysTakePrecedence() {
        redis.opsForHash().put(prefix + "control", "autoState", "EMERGENCY");
        assertThatThrownBy(() -> service.status(null)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        seedAutomatic(UUID.randomUUID().toString(), "EMERGENCY", now(), 0, 0, 0, "HIGH");
        redis.opsForHash().put(prefix + "control", "autoClearMs", "invalid");
        assertThatThrownBy(() -> service.status(null)).isInstanceOf(ServiceAdmissionService.UnavailableException.class);
        control("OFF");
        assertThat(service.status(null).state()).isEqualTo("BYPASS");
        control("EMERGENCY");
        assertThat(service.status(null).mode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
        assertThat(redis.opsForHash().get(prefix + "control", "autoState")).isEqualTo("EMERGENCY");
    }

    @Test
    void turningOffObservationDoesNotReleaseAStoredOverrideAndRealWritesUseTheSameControlContract() {
        String owner = UUID.randomUUID().toString();
        properties.getAutomatic().setEnabled(true);
        service.observeAutomatic(owner, ServiceAdmissionAutomaticPolicy.Signal.HIGH);
        assertThat(redis.opsForHash().get(prefix + "control", "autoOwner")).isEqualTo(owner);
        seedAutomatic(owner, "EMERGENCY", now(), 0, 0, 0, "HIGH");
        properties.getAutomatic().setEnabled(false);
        var before = redis.opsForHash().entries(prefix + "control");
        service.observeAutomatic(owner, ServiceAdmissionAutomaticPolicy.Signal.CLEAR);
        assertThat(redis.opsForHash().entries(prefix + "control")).isEqualTo(before);
        assertThat(service.status(null).mode()).isEqualTo(ServiceAdmissionService.Mode.EMERGENCY);
    }

    private void seedAutomatic(String owner, String state, long observed, long high, long clear, long emergency, String signal) {
        redis.opsForHash().putAll(prefix + "control", Map.of("autoState", state, "autoOwner", owner,
                "autoLeaseUntil", Long.toString(observed + 20000), "autoObservedAt", Long.toString(observed),
                "autoHighMs", Long.toString(high), "autoClearMs", Long.toString(clear),
                "autoEmergencyMs", Long.toString(emergency), "autoSignal", signal));
    }

    private List<?> automatic(String signal, String owner, long observed) {
        String source;
        try (var input = new ClassPathResource("redis/service-admission.lua").getInputStream()) {
            source = new String(input.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
        } catch (java.io.IOException unavailable) { throw new AssertionError(unavailable); }
        String authority = "local t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)";
        assertThat(source).contains(authority);
        // Only this disposable fixture clock is replaced; the production Lua body and Redis atomicity are unchanged.
        var script = new DefaultRedisScript<>(source.replace(authority, "local now = tonumber(ARGV[13])"), List.class);
        return redis.execute(script, SUFFIXES.stream().map(suffix -> prefix + suffix).toList(), "automatic", owner, signal,
                ServiceAdmissionService.marker(properties), Integer.toString(properties.getCapacity()),
                Long.toString(properties.getSessionSeconds() * 1000L), Long.toString(properties.getMaxSessionSeconds() * 1000L),
                Long.toString(properties.getHeartbeatTimeoutSeconds() * 1000L), Integer.toString(properties.getMaxWaiting()),
                Long.toString(properties.getAutomatic().getPressureSeconds() * 1000L),
                Long.toString(properties.getAutomatic().getRecoverySeconds() * 1000L),
                Long.toString(properties.getAutomatic().getMinimumEmergencySeconds() * 1000L), Long.toString(observed));
    }

    private List<String> passSnapshot() {
        return SUFFIXES.subList(1, 6).stream().map(suffix -> {
            byte[] dump = redis.dump(prefix + suffix);
            return dump == null ? "" : java.util.Base64.getEncoder().encodeToString(dump);
        }).toList();
    }

    private void control(String mode) {
        properties.validate();
        redis.opsForHash().putAll(prefix + "control", Map.of("marker", ServiceAdmissionService.marker(properties), "mode", mode));
    }

    private static String ticket(int number) {
        return String.format(Locale.ROOT, "%08d-0000-4000-8000-000000000000", number);
    }

    private static long now() {
        Long now = redis.execute(new DefaultRedisScript<>("local t=redis.call('TIME'); return tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)", Long.class), List.of());
        if (now == null) throw new AssertionError("Disposable Redis time is unavailable");
        return now;
    }

    private static String command(String stdin, String... args) throws Exception {
        var command = new ArrayList<String>();
        command.add("docker");
        command.addAll(List.of(args));
        var process = new ProcessBuilder(command).redirectErrorStream(true).start();
        try {
            if (stdin != null) process.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            if (!process.waitFor(15, TimeUnit.SECONDS)) throw new IllegalStateException("Disposable Redis command timed out");
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable Redis command failed");
            return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } finally { process.destroyForcibly(); }
    }
}
