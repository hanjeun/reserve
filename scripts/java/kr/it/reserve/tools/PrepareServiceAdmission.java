package kr.it.reserve.tools;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import kr.it.reserve.global.admission.ServiceAdmissionProperties;
import kr.it.reserve.global.admission.ServiceAdmissionService;
import kr.it.reserve.global.admission.ServiceAdmissionService.Mode;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.slf4j.LoggerFactory;

import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Standalone operator tool. It never starts Spring, a worker, or a remote dots action. */
public final class PrepareServiceAdmission {
    private PrepareServiceAdmission() { }

    private static final ObjectMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final Set<String> FIELDS = Set.of("epoch", "capacity", "sessionSeconds", "maxSessionSeconds",
            "heartbeatTimeoutSeconds", "maxWaiting");
    private static final List<String> SUFFIXES = List.of("control", "waiting", "active", "heartbeats", "born", "sequence");

    /** Only explicit OFF may remove the fixed automatic metadata fields; pass/queue state is never removed. */
    public static final String PREPARE = """
            if #KEYS ~= 6 or #ARGV ~= 2 then return -3 end
            local marker, requested = ARGV[1], ARGV[2]
            if #marker ~= 64 or string.find(marker, '[^0-9a-f]') then return -3 end
            if requested ~= 'OFF' and requested ~= 'CORE' and requested ~= 'EMERGENCY' then return -3 end
            local types = {'hash', 'zset', 'zset', 'zset', 'hash', 'string'}
            local controlType = redis.call('TYPE', KEYS[1]).ok
            if controlType == 'none' then
              for i = 2, 6 do if redis.call('EXISTS', KEYS[i]) ~= 0 then return -2 end end
              redis.call('HSET', KEYS[1], 'marker', marker, 'mode', requested)
              return 1
            end
            if controlType ~= 'hash' or redis.call('PTTL', KEYS[1]) ~= -1 then return -3 end
            local control = redis.call('HMGET', KEYS[1], 'marker', 'mode')
            if control[1] ~= marker then return -1 end
            if control[2] ~= 'OFF' and control[2] ~= 'CORE' and control[2] ~= 'EMERGENCY' then return -3 end
            for i = 2, 6 do
              local kind = redis.call('TYPE', KEYS[i]).ok
              if kind ~= 'none' and kind ~= types[i] then return -3 end
            end
            local cleared = 0
            if requested == 'OFF' then
              cleared = redis.call('HDEL', KEYS[1], 'autoState', 'autoOwner', 'autoLeaseUntil', 'autoObservedAt',
                'autoHighMs', 'autoClearMs', 'autoEmergencyMs', 'autoSignal')
            end
            if control[2] == requested then return cleared > 0 and 3 or 0 end
            redis.call('HSET', KEYS[1], 'mode', requested)
            return cleared > 0 and 3 or 2
            """;

    public static void main(String[] args) {
        try {
            run(Options.parse(args), System.getenv(), System.out);
        } catch (Refused exception) {
            System.err.println("{\"state\":\"REFUSED\",\"reason\":\"" + exception.reason + "\"}");
            System.exit(2);
        } catch (Exception exception) {
            // A Redis response can be lost after commit; do not claim that no change occurred.
            System.err.println("{\"state\":\"UNKNOWN\",\"reason\":\"PREPARATION_OUTCOME_UNCONFIRMED\"}");
            System.exit(2);
        }
    }

    static void run(Options options, Map<String, String> environment, PrintStream output) throws Exception {
        var plan = preview(options);
        if (!options.apply) {
            output.println(JSON.writeValueAsString(plan.summary()));
            return;
        }
        long result = apply(plan, endpoint(options.production, environment));
        String state = switch ((int) result) {
            case 0 -> "ALREADY_PREPARED";
            case 1 -> "INITIALIZED";
            case 2 -> "MODE_CHANGED";
            case 3 -> "AUTOMATIC_STATE_CLEARED";
            case -1 -> throw new Refused("MARKER_MISMATCH_RESET_FORBIDDEN");
            case -2 -> throw new Refused("ORPHANED_STATE_RESET_FORBIDDEN");
            default -> throw new Refused("INCONSISTENT_STATE_RESET_FORBIDDEN");
        };
        output.println(JSON.writeValueAsString(Map.of("state", state, "namespace", options.production ? "production" : "local",
                "mode", options.mode.name(), "marker", plan.marker, "applicationConfigurationChanged", false)));
    }

    static Plan preview(Options options) throws Exception {
        ServiceAdmissionProperties properties = configuration(options.config);
        String prefix = (options.production ? RedisNamespace.PRODUCTION : RedisNamespace.LOCAL).prefix()
                + "service-admission:{entry}:";
        return new Plan(properties, options.mode, options.production, prefix, ServiceAdmissionService.marker(properties));
    }

    private static ServiceAdmissionProperties configuration(Path file) throws Exception {
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > 16384) throw new Refused("INVALID_CONFIGURATION");
            byte[] bytes;
            try (var input = Files.newInputStream(file)) { bytes = input.readNBytes(16385); }
            if (bytes.length > 16384) throw new Refused("INVALID_CONFIGURATION");
            JsonNode root = JSON.readTree(bytes);
            if (root == null || !root.isObject()) throw new Refused("INVALID_CONFIGURATION");
            var names = root.fieldNames();
            while (names.hasNext()) if (!FIELDS.contains(names.next())) throw new Refused("INVALID_CONFIGURATION");
            if (!root.path("epoch").isTextual()) throw new Refused("INVALID_CONFIGURATION");
            var properties = new ServiceAdmissionProperties();
            properties.setEpoch(root.get("epoch").textValue());
            properties.setCapacity(number(root, "capacity", properties.getCapacity()));
            properties.setSessionSeconds(number(root, "sessionSeconds", properties.getSessionSeconds()));
            properties.setMaxSessionSeconds(number(root, "maxSessionSeconds", properties.getMaxSessionSeconds()));
            properties.setHeartbeatTimeoutSeconds(number(root, "heartbeatTimeoutSeconds", properties.getHeartbeatTimeoutSeconds()));
            properties.setMaxWaiting(number(root, "maxWaiting", properties.getMaxWaiting()));
            // Validate a candidate even while the actual application default remains disabled.
            properties.setEnabled(true);
            properties.validate();
            properties.setEnabled(false);
            return properties;
        } catch (Refused exception) { throw exception; }
        catch (Exception exception) { throw new Refused("INVALID_CONFIGURATION"); }
    }

    private static int number(JsonNode root, String field, int fallback) {
        if (!root.has(field)) return fallback;
        JsonNode value = root.get(field);
        if (!value.isIntegralNumber() || !value.canConvertToInt()) throw new Refused("INVALID_CONFIGURATION");
        return value.intValue();
    }

    static Endpoint endpoint(boolean production, Map<String, String> environment) {
        String host = required(environment, "RESERVE_REDIS_HOST");
        if (production ? !internalHost(host) : !List.of("127.0.0.1", "::1").contains(host)) {
            throw new Refused("EXPLICIT_REDIS_SCOPE_REQUIRED");
        }
        String rawPort = required(environment, "RESERVE_REDIS_PORT");
        if (!rawPort.matches("[1-9][0-9]{0,4}")) throw new Refused("INVALID_REDIS_INPUT");
        int port = Integer.parseInt(rawPort);
        if (port > 65535) throw new Refused("INVALID_REDIS_INPUT");
        String password = required(environment, "RESERVE_REDIS_PASSWORD");
        if (!strongPassword(password)) throw new Refused("STRONG_REDIS_SECRET_REQUIRED");
        String username = environment.get("RESERVE_REDIS_USERNAME");
        if (username != null && !username.matches("[A-Za-z0-9._-]{1,128}")) throw new Refused("INVALID_REDIS_INPUT");
        return new Endpoint(host, port, username, password);
    }

    static boolean strongPassword(String value) {
        if (value == null || value.length() < 32 || value.length() > 256
                || value.chars().anyMatch(character -> character < 33 || character > 126)
                || value.chars().distinct().count() < 12) return false;
        String lower = value.toLowerCase(Locale.ROOT);
        if (List.of("password", "changeme", "placeholder", "example", "synthetic").stream().anyMatch(lower::contains)) return false;
        for (int size = 1; size <= value.length() / 2; size++) {
            if (value.length() % size == 0 && value.substring(0, size).repeat(value.length() / size).equals(value)) return false;
        }
        return true;
    }

    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) throw new Refused("DEDICATED_REDIS_INPUT_REQUIRED");
        return value;
    }

    static boolean internalHost(String host) {
        if (host.equals("redis")) return true;
        if (!host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) return false;
        String[] parts = host.split("\\.");
        int[] ip = new int[4];
        for (int i = 0; i < parts.length; i++) {
            if (parts[i].length() > 1 && parts[i].startsWith("0")) return false;
            ip[i] = Integer.parseInt(parts[i]);
            if (ip[i] > 255) return false;
        }
        return ip[0] == 10 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] == 192 && ip[1] == 168;
    }

    static long apply(Plan plan, Endpoint endpoint) throws Exception {
        // This dedicated CLI must not emit client diagnostics containing endpoint or credential material.
        if (!(LoggerFactory.getILoggerFactory() instanceof LoggerContext logging)) throw new Refused("UNSUPPORTED_CLIENT_LOGGING");
        logging.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).setLevel(Level.OFF);
        var server = new RedisStandaloneConfiguration(endpoint.host, endpoint.port);
        server.setPassword(endpoint.password);
        if (endpoint.username != null) server.setUsername(endpoint.username);
        var factory = new LettuceConnectionFactory(server, LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofSeconds(2)).shutdownTimeout(Duration.ofMillis(100)).build());
        try {
            factory.afterPropertiesSet();
            factory.start();
            try (var connection = factory.getConnection()) {
                var policy = connection.serverCommands().getConfig("maxmemory-policy");
                if (policy == null || !"noeviction".equals(policy.getProperty("maxmemory-policy"))) {
                    throw new Refused("VERIFIED_NOEVICTION_REQUIRED");
                }
            }
            var redis = new StringRedisTemplate(factory);
            redis.afterPropertiesSet();
            Long result = redis.execute(new DefaultRedisScript<>(PREPARE, Long.class), plan.keys(), plan.marker, plan.mode.name());
            if (result == null) throw new IllegalStateException("Preparation result unavailable");
            return result;
        } finally { factory.destroy(); }
    }

    record Options(Path config, Mode mode, boolean production, boolean apply) {
        static Options parse(String[] args) {
            if (args.length < 2 || !"--config".equals(args[0])) throw new Refused("USE_CONFIG_MODE_PRODUCTION_APPLY_OPTIONS");
            Mode mode = Mode.OFF;
            boolean modeSpecified = false, production = false, apply = false;
            for (int i = 2; i < args.length; i++) {
                switch (args[i]) {
                    case "--mode" -> {
                        if (modeSpecified || ++i >= args.length) throw new Refused("INVALID_OPTION");
                        try { mode = Mode.valueOf(args[i]); }
                        catch (IllegalArgumentException exception) { throw new Refused("INVALID_MODE"); }
                        modeSpecified = true;
                    }
                    case "--production" -> { if (production) throw new Refused("INVALID_OPTION"); production = true; }
                    case "--apply" -> { if (apply) throw new Refused("INVALID_OPTION"); apply = true; }
                    default -> throw new Refused("INVALID_OPTION");
                }
            }
            if (apply && !modeSpecified) throw new Refused("EXPLICIT_MODE_REQUIRED_FOR_APPLY");
            try { return new Options(Path.of(args[1]), mode, production, apply); }
            catch (RuntimeException exception) { throw new Refused("INVALID_CONFIGURATION"); }
        }
    }

    record Plan(ServiceAdmissionProperties properties, Mode mode, boolean production, String prefix, String marker) {
        List<String> keys() { return SUFFIXES.stream().map(suffix -> prefix + suffix).toList(); }
        Map<String, Object> summary() {
            var result = new LinkedHashMap<String, Object>();
            result.put("state", "PREVIEW_ONLY"); result.put("redisConnected", false);
            result.put("applicationEnabledDefault", false); result.put("applicationConfigurationChanged", false);
            result.put("namespace", production ? "production" : "local"); result.put("mode", mode.name()); result.put("marker", marker);
            result.put("capacity", properties.getCapacity()); result.put("sessionSeconds", properties.getSessionSeconds());
            result.put("maxSessionSeconds", properties.getMaxSessionSeconds());
            result.put("heartbeatTimeoutSeconds", properties.getHeartbeatTimeoutSeconds()); result.put("maxWaiting", properties.getMaxWaiting());
            return result;
        }
    }

    record Endpoint(String host, int port, String username, String password) {
        @Override public String toString() { return "Endpoint[redacted]"; }
    }

    static final class Refused extends IllegalArgumentException {
        final String reason;
        Refused(String reason) { super(reason); this.reason = reason; }
    }
}
