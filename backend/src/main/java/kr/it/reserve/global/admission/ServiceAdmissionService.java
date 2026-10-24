package kr.it.reserve.global.admission;

import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

/** Separate visitor passes never authenticate a member or reserve a booking slot. */
@Service
public class ServiceAdmissionService {
    public enum Mode { OFF, CORE, EMERGENCY }
    public record Entry(String ticket, String state, long position, long expiresAt, long absoluteExpiresAt,
                        long serverTime, int pollAfterSeconds, int heartbeatTimeoutSeconds, Mode mode) {
        @Override public String toString() { return "Entry[state=" + state + ", mode=" + mode + ", ticket=redacted]"; }
    }
    public static final class UnavailableException extends RuntimeException {
        public UnavailableException() { super("입장 상태를 잠시 확인할 수 없어요. 잠시 후 다시 시도해주세요."); }
    }

    private static final Set<String> STATES = Set.of("MODE", "BYPASS", "NOT_JOINED", "WAITING", "ADMITTED", "EXPIRED", "CANCELLED", "FULL");
    private static final long MODE_CACHE_NANOS = TimeUnit.SECONDS.toNanos(1);
    private static final long REDIS_RETRY_NANOS = TimeUnit.SECONDS.toNanos(5);
    private static final long THROTTLE_QUIET_NANOS = TimeUnit.SECONDS.toNanos(15);
    private final ServiceAdmissionProperties properties;
    private final ObjectProvider<StringRedisTemplate> redis;
    private final ObjectProvider<RedisNamespace> namespace;
    private final DefaultRedisScript<List> script = new DefaultRedisScript<>();
    private final Object modeLock = new Object();
    private volatile ModeSnapshot modeSnapshot;
    private final AtomicReference<RedisRecovery> redisRecovery = new AtomicReference<>();
    private final AtomicReference<Long> lastEmergencyThrottleAt = new AtomicReference<>();
    private LongSupplier nanoTime = System::nanoTime;
    private record ModeSnapshot(Mode mode, long loadedAt) {
        boolean fresh(long now) { long age = now - loadedAt; return age >= 0 && age < MODE_CACHE_NANOS; }
    }
    private record RedisRecovery(long retryAt, boolean probing) { }

    public ServiceAdmissionService(ServiceAdmissionProperties properties, ObjectProvider<StringRedisTemplate> redis,
                                   ObjectProvider<RedisNamespace> namespace) {
        this.properties = properties;
        this.redis = redis;
        this.namespace = namespace;
        script.setLocation(new ClassPathResource("redis/service-admission.lua"));
        script.setResultType(List.class);
    }

    /** Only routing mode is cached; a failed reload never falls back to a stale OFF or admitted response. */
    public Mode currentMode() {
        if (!properties.isEnabled()) { modeSnapshot = null; return Mode.OFF; }
        // Recovery probes use CAS, so concurrent callers never queue behind a failed Redis reload.
        if (redisRecovery.get() != null) return loadMode(nanoTime.getAsLong());
        ModeSnapshot snapshot = modeSnapshot;
        if (snapshot != null && snapshot.fresh(nanoTime.getAsLong())) return snapshot.mode();
        synchronized (modeLock) {
            long started = nanoTime.getAsLong();
            snapshot = modeSnapshot;
            if (snapshot != null && snapshot.fresh(started)) return snapshot.mode();
            return loadMode(started);
        }
    }

    private Mode loadMode(long started) {
        try {
            Mode mode = call("mode", "", "").mode();
            modeSnapshot = new ModeSnapshot(mode, started);
            return mode;
        } catch (RuntimeException unavailable) {
            modeSnapshot = null;
            throw unavailable;
        }
    }

    private RedisRecovery beginRedisCall() {
        RedisRecovery state = redisRecovery.get();
        if (state == null) return null;
        if (state.probing() || state.retryAt() - nanoTime.getAsLong() > 0) throw new UnavailableException();
        var probe = new RedisRecovery(state.retryAt(), true);
        if (!redisRecovery.compareAndSet(state, probe)) throw new UnavailableException();
        return probe;
    }

    /** Only join may replace a missing or expired cookie with a new server-generated ticket. */
    public Entry join(String existingTicket) {
        return call("join", uuid(existingTicket) ? existingTicket : "", UUID.randomUUID().toString());
    }
    public Entry status(String ticket) { return call("status", presented(ticket), ""); }
    public Entry cancel(String ticket) { return call("cancel", presented(ticket), ""); }

    /** Actual emergency rejections only. One local monotonic timestamp; never an extra Redis operation. */
    public void noteEmergencyThrottle() {
        if (!properties.isEnabled() || !properties.getAutomatic().isEnabled()) return;
        long now = nanoTime.getAsLong();
        lastEmergencyThrottleAt.updateAndGet(previous -> previous == null || now - previous >= 0 ? now : previous);
    }

    /** Disabling observation never clears an existing Redis override or performs an extra Redis call. */
    void observeAutomatic(String owner, ServiceAdmissionAutomaticPolicy.Signal signal) {
        if (!properties.isEnabled() || !properties.getAutomatic().isEnabled()) return;
        long started = nanoTime.getAsLong();
        Long throttledAt = lastEmergencyThrottleAt.get();
        if (signal == ServiceAdmissionAutomaticPolicy.Signal.CLEAR && throttledAt != null) {
            long quiet = started - throttledAt;
            // Even a regressed/uncertain local clock cannot be evidence for relaxing protection.
            if (quiet < THROTTLE_QUIET_NANOS) signal = ServiceAdmissionAutomaticPolicy.Signal.HOLD;
        }
        try {
            var entry = call("automatic", owner, signal.name());
            modeSnapshot = new ModeSnapshot(entry.mode(), started);
        } catch (RuntimeException unavailable) {
            modeSnapshot = null;
            throw unavailable;
        }
    }

    /** CHECK touches admitted activity only; it never creates/promotes a visitor or renews a waiting heartbeat. */
    public boolean admitted(String ticket) {
        var entry = call("check", presented(ticket), "");
        return entry.mode() == Mode.OFF || "ADMITTED".equals(entry.state());
    }

    public String prefix() {
        var scope = namespace.getIfAvailable();
        if (scope == null) throw new UnavailableException();
        return scope.prefix() + "service-admission:{entry}:";
    }

    /** Mode changes preserve live passes; changing any capacity/lifetime identity requires an explicit reset. */
    public static String marker(ServiceAdmissionProperties p) {
        String canonical = "v1|" + p.getEpoch() + "|" + p.getCapacity() + "|" + p.getSessionSeconds()
                + "|" + p.getMaxSessionSeconds() + "|" + p.getHeartbeatTimeoutSeconds() + "|" + p.getMaxWaiting();
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private Entry call(String action, String ticket, String candidate) {
        if (!properties.isEnabled()) return new Entry(null, "BYPASS", 0, 0, 0, System.currentTimeMillis(), 4,
                properties.getHeartbeatTimeoutSeconds(), Mode.OFF);
        var template = redis.getIfAvailable();
        if (template == null) throw new UnavailableException();
        String p = prefix();
        List<?> result;
        RedisRecovery probe = beginRedisCall();
        try {
            var args = new ArrayList<Object>(List.of(action, ticket, candidate, marker(properties), Integer.toString(properties.getCapacity()),
                    Long.toString(properties.getSessionSeconds() * 1000L), Long.toString(properties.getMaxSessionSeconds() * 1000L),
                    Long.toString(properties.getHeartbeatTimeoutSeconds() * 1000L), Integer.toString(properties.getMaxWaiting())));
            if ("automatic".equals(action)) {
                args.add(Long.toString(properties.getAutomatic().getPressureSeconds() * 1000L));
                args.add(Long.toString(properties.getAutomatic().getRecoverySeconds() * 1000L));
                args.add(Long.toString(properties.getAutomatic().getMinimumEmergencySeconds() * 1000L));
            }
            result = template.execute(script, List.of(p+"control", p+"waiting", p+"active", p+"heartbeats", p+"born", p+"sequence"),
                    args.toArray());
            if (probe != null) redisRecovery.compareAndSet(probe, null);
        } catch (DataAccessException e) {
            modeSnapshot = null;
            redisRecovery.set(new RedisRecovery(nanoTime.getAsLong() + REDIS_RETRY_NANOS, false));
            throw new UnavailableException();
        } catch (RuntimeException e) {
            // A non-connection error must not leave a half-open probe permanently occupied.
            if (probe != null) redisRecovery.compareAndSet(probe, null);
            throw e;
        }
        if (result == null || result.size() != 7) throw new UnavailableException();
        try {
            String state = result.getFirst().toString();
            if (!STATES.contains(state)) throw new UnavailableException();
            Mode mode = Mode.valueOf(result.get(6).toString());
            long position = Long.parseLong(result.get(2).toString());
            int timeout = "ADMITTED".equals(state) ? properties.getSessionSeconds() : properties.getHeartbeatTimeoutSeconds();
            int ranked = mode == Mode.EMERGENCY ? position <= 10 ? 8 : position <= 100 ? 20 : 30
                    : position <= 10 ? 4 : position <= 100 ? 10 : 20;
            int interval = "ADMITTED".equals(state) ? Math.min(60, timeout / 3)
                    : "WAITING".equals(state) ? Math.min(ranked, timeout / 3) : 4;
            String returnedTicket = result.get(1).toString();
            if (("ADMITTED".equals(state) || "WAITING".equals(state)) && !uuid(returnedTicket)) throw new UnavailableException();
            return new Entry(returnedTicket.isEmpty() ? null : returnedTicket, state, position,
                    Long.parseLong(result.get(3).toString()), Long.parseLong(result.get(4).toString()),
                    Long.parseLong(result.get(5).toString()), interval, timeout, mode);
        } catch (IllegalArgumentException | NullPointerException e) { throw new UnavailableException(); }
    }

    private static String presented(String ticket) {
        return ticket == null || ticket.isBlank() ? "" : uuid(ticket) ? ticket : "invalid";
    }
    private static boolean uuid(String ticket) {
        try { return ticket != null && ticket.length() == 36 && UUID.fromString(ticket).toString().equals(ticket); }
        catch (IllegalArgumentException e) { return false; }
    }
}
