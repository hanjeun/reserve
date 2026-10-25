package kr.it.reserve.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.admission.ServiceAdmissionProperties;
import kr.it.reserve.global.admission.ServiceAdmissionService;
import kr.it.reserve.global.admission.ServiceAdmissionService.Mode;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** 앱·DB·작업자·운영 연결 없이 독립 준비 도구의 계약만 검사한다. */
public final class PrepareServiceAdmissionTest {
    private static int checks;
    private static final String CONFIG = "{\"epoch\":\"11111111-1111-4111-8111-111111111111\"}";

    public static void main(String[] args) throws Exception {
        if (args.length != 0 && !(args.length == 1 && args[0].equals("--owned-redis"))) throw new AssertionError("Unsupported test option");
        ((ch.qos.logback.classic.LoggerContext) org.slf4j.LoggerFactory.getILoggerFactory())
                .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).setLevel(ch.qos.logback.classic.Level.OFF);
        Path config = Files.createTempFile("reserve-service-admission-contract-", ".json");
        try {
            Files.writeString(config, CONFIG);
            pureContracts(config);
            if (args.length == 1) try (var owned = new OwnedRedis()) { redisContracts(config, owned); }
            System.out.println("SERVICE_ADMISSION_HELPER_CONTRACTS checks=" + checks + " ownedRedis=" + (args.length == 1));
        } finally { Files.deleteIfExists(config); }
    }

    private static void pureContracts(Path config) throws Exception {
        var options = PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString()});
        check(!options.apply() && !options.production() && options.mode() == Mode.OFF, "Preview defaults");
        var unreadableEnvironment = new AbstractMap<String, String>() {
            @Override public String get(Object key) { throw new AssertionError("Preview must not read environment values"); }
            @Override public Set<Entry<String, String>> entrySet() { throw new AssertionError("Preview must not enumerate environment"); }
        };
        var buffer = new ByteArrayOutputStream();
        PrepareServiceAdmission.run(options, unreadableEnvironment, new PrintStream(buffer, true, StandardCharsets.UTF_8));
        var summary = new ObjectMapper().readTree(buffer.toByteArray());
        check("PREVIEW_ONLY".equals(summary.path("state").asText()) && !summary.path("redisConnected").asBoolean(true), "Read-only preview");
        check(!summary.path("applicationEnabledDefault").asBoolean(true) && !summary.path("applicationConfigurationChanged").asBoolean(true), "Application remains disabled");
        check(summary.path("capacity").asInt() == 20 && summary.path("maxWaiting").asInt() == 1000, "Helper uses current conservative property defaults");
        check(!summary.has("epoch") && !summary.has("host") && !summary.has("password") && !summary.has("config"), "Output projection");
        var plan = PrepareServiceAdmission.preview(options);
        var beans = new StaticListableBeanFactory(); beans.addBean("scope", RedisNamespace.LOCAL);
        var service = new ServiceAdmissionService(plan.properties(), beans.getBeanProvider(StringRedisTemplate.class), beans.getBeanProvider(RedisNamespace.class));
        check(plan.prefix().equals(service.prefix()) && plan.keys().equals(List.of(plan.prefix()+"control", plan.prefix()+"waiting", plan.prefix()+"active", plan.prefix()+"heartbeats", plan.prefix()+"born", plan.prefix()+"sequence")), "Exact runtime key contract");
        check(plan.marker().equals(ServiceAdmissionService.marker(plan.properties())) && !plan.properties().isEnabled(), "Shared marker and disabled property");
        var production = PrepareServiceAdmission.preview(new PrepareServiceAdmission.Options(config, Mode.EMERGENCY, true, false));
        check(production.prefix().equals("reserve:prod:service-admission:{entry}:") && production.marker().equals(plan.marker()), "Explicit production scope and mode-independent marker");

        rejected(() -> PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString(), "--apply"}), "Apply requires explicit mode");
        rejected(() -> PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString(), "--reset"}), "Reset has no option");
        rejected(() -> PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString(), "--mode", "core"}), "Exact mode enum");
        rejected(() -> PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString(), "--production", "--production"}), "Duplicate options");
        rejected(() -> PrepareServiceAdmission.Options.parse(new String[]{"--config", config.toString(), "--mode", "OFF", "--mode", "CORE"}), "Duplicate modes");

        for (String invalid : List.of("{\"epoch\":\"11111111-1111-4111-8111-111111111111\",\"enabled\":true}",
                "{\"epoch\":\"11111111-1111-4111-8111-111111111111\",\"capacity\":100,\"capacity\":101}",
                "{\"epoch\":\"11111111-1111-4111-8111-111111111111\",\"capacity\":\"100\"}",
                "{\"epoch\":\"11111111-1111-4111-8111-111111111111\",\"capacity\":100.1}",
                "{\"epoch\":\"11111111-1111-4111-8111-111111111111\",\"capacity\":0}", CONFIG + " {}", "{}")) {
            Files.writeString(config, invalid);
            rejected(() -> PrepareServiceAdmission.preview(options), "Strict candidate configuration");
        }
        Files.writeString(config, CONFIG);
        String secret = UUID.randomUUID().toString() + UUID.randomUUID();
        var local = Map.of("RESERVE_REDIS_HOST", "127.0.0.1", "RESERVE_REDIS_PORT", "6379", "RESERVE_REDIS_PASSWORD", secret);
        check(PrepareServiceAdmission.endpoint(false, local).toString().equals("Endpoint[redacted]"), "Redacted endpoint representation");
        rejected(() -> PrepareServiceAdmission.endpoint(true, local), "Local endpoint cannot select production");
        rejected(() -> PrepareServiceAdmission.endpoint(false, Map.of("RESERVE_REDIS_HOST", "redis", "RESERVE_REDIS_PORT", "6379", "RESERVE_REDIS_PASSWORD", secret)), "Production hostname requires explicit scope");
        for (String host : List.of("reserve.it.kr", "8.8.8.8", "10.0.0.1.attacker.test", "010.0.0.1", "172.32.0.1", "192.168.1.999")) {
            check(!PrepareServiceAdmission.internalHost(host), "Invalid production endpoint");
        }
        for (String host : List.of("redis", "10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.1")) {
            check(PrepareServiceAdmission.internalHost(host), "Private endpoint syntax");
        }
        check(PrepareServiceAdmission.strongPassword(secret), "Generated synthetic secret format");
        for (String weak : List.of("a".repeat(64), "0123456789abcdef".repeat(4), "password-" + secret, secret + "\n", "short", "example-" + secret)) {
            check(!PrepareServiceAdmission.strongPassword(weak), "Weak secret rejected");
        }
    }

    private static void redisContracts(Path config, OwnedRedis owned) throws Exception {
        var plan = PrepareServiceAdmission.preview(new PrepareServiceAdmission.Options(config, Mode.CORE, false, true));
        var endpoint = PrepareServiceAdmission.endpoint(false, Map.of("RESERVE_REDIS_HOST", "127.0.0.1", "RESERVE_REDIS_PORT", Integer.toString(owned.port), "RESERVE_REDIS_PASSWORD", owned.password));
        var standalone = new RedisStandaloneConfiguration("127.0.0.1", owned.port); standalone.setPassword(owned.password);
        var factory = new LettuceConnectionFactory(standalone);
        try {
            factory.afterPropertiesSet(); factory.start();
            var redis = new StringRedisTemplate(factory); redis.afterPropertiesSet();
            check(PrepareServiceAdmission.apply(plan, endpoint) == 1, "Atomic fresh initialization");
            check(redis.opsForHash().entries(plan.prefix()+"control").equals(Map.of("marker", plan.marker(), "mode", "CORE")), "Runtime control format");
            check(redis.countExistingKeys(plan.keys()) == 1 && redis.getExpire(plan.prefix()+"control") == -1, "Initialization creates only permanent control");
            String prefix = plan.prefix();
            redis.opsForZSet().add(prefix+"waiting", "synthetic-waiter", 1);
            redis.opsForZSet().add(prefix+"active", "synthetic-admitted", 123456);
            redis.opsForZSet().add(prefix+"heartbeats", "synthetic-waiter", 234567);
            redis.opsForHash().put(prefix+"born", "synthetic-admitted", "123000");
            redis.opsForValue().set(prefix+"sequence", "9");
            var before = snapshot(redis, plan.keys().subList(1, 6));
            for (Mode mode : List.of(Mode.EMERGENCY, Mode.OFF, Mode.CORE)) {
                var changed = new PrepareServiceAdmission.Plan(plan.properties(), mode, false, prefix, plan.marker());
                check(PrepareServiceAdmission.apply(changed, endpoint) == 2, "Mode transition");
                check(snapshot(redis, plan.keys().subList(1, 6)).equals(before), "Mode preserves every state byte");
                check(PrepareServiceAdmission.apply(changed, endpoint) == 0, "Repeated preparation is idempotent");
            }
            var off = new PrepareServiceAdmission.Plan(plan.properties(), Mode.OFF, false, prefix, plan.marker());
            redis.opsForHash().putAll(prefix+"control", Map.of("autoState", "malformed", "autoOwner", "synthetic",
                    "autoLeaseUntil", "1", "autoObservedAt", "1", "autoHighMs", "1", "autoClearMs", "1",
                    "autoEmergencyMs", "1", "autoSignal", "invalid", "unrelated", "keep"));
            check(PrepareServiceAdmission.apply(off, endpoint) == 3, "Explicit OFF clears only automatic metadata and reports it");
            check(redis.opsForHash().entries(prefix+"control").equals(Map.of("marker", plan.marker(), "mode", "OFF", "unrelated", "keep")),
                    "Automatic reset whitelist preserves marker and unrelated control fields");
            check(snapshot(redis, plan.keys().subList(1, 6)).equals(before), "Automatic reset preserves all pass and queue bytes");
            check(PrepareServiceAdmission.apply(off, endpoint) == 0, "OFF reset retry is unchanged");
            redis.opsForHash().put(prefix+"control", "autoState", "EMERGENCY");
            check(PrepareServiceAdmission.apply(off, endpoint) == 3, "Already OFF with residual metadata is repaired explicitly");
            check(PrepareServiceAdmission.apply(off, endpoint) == 0, "Residual repair retry is unchanged");
            check(PrepareServiceAdmission.apply(plan, endpoint) == 2, "CORE starts with no automatic evidence after OFF");
            var mismatch = new PrepareServiceAdmission.Plan(plan.properties(), Mode.OFF, false, prefix, "f".repeat(64));
            check(PrepareServiceAdmission.apply(mismatch, endpoint) == -1 && "CORE".equals(redis.opsForHash().get(prefix+"control", "mode")), "Marker mismatch cannot open the gate");
            redis.delete(prefix+"control");
            check(PrepareServiceAdmission.apply(plan, endpoint) == -2 && snapshot(redis, plan.keys().subList(1, 6)).equals(before), "Orphaned state cannot initialize or reset");
            redis.opsForValue().set(prefix+"control", "wrong-type");
            check(PrepareServiceAdmission.apply(plan, endpoint) == -3 && "wrong-type".equals(redis.opsForValue().get(prefix+"control")), "Wrong control type preserved and refused");
            redis.delete(prefix+"control");
            redis.opsForHash().putAll(prefix+"control", Map.of("marker", plan.marker(), "mode", "INVALID"));
            check(PrepareServiceAdmission.apply(plan, endpoint) == -3, "Invalid prior mode cannot be repaired silently");
            redis.opsForHash().put(prefix+"control", "mode", "CORE");
            redis.expire(prefix+"control", Duration.ofMinutes(1));
            check(PrepareServiceAdmission.apply(plan, endpoint) == -3 && redis.getExpire(prefix+"control") > 0, "Expiring control refused without TTL reset");
            redis.persist(prefix+"control");
            redis.delete(prefix+"active"); redis.opsForValue().set(prefix+"active", "wrong-type");
            check(PrepareServiceAdmission.apply(plan, endpoint) == -3, "Wrong state type refused");
            redis.delete(plan.keys());
            var script = new DefaultRedisScript<Long>(PrepareServiceAdmission.PREPARE, Long.class);
            try (var executor = Executors.newFixedThreadPool(2)) {
                List<Callable<Long>> tasks = List.of(() -> redis.execute(script, plan.keys(), plan.marker(), "CORE"),
                        () -> redis.execute(script, plan.keys(), "e".repeat(64), "EMERGENCY"));
                var results = executor.invokeAll(tasks);
                var values = List.of(results.get(0).get(5, TimeUnit.SECONDS), results.get(1).get(5, TimeUnit.SECONDS));
                check(values.contains(1L) && values.contains(-1L), "Concurrent initialization never overwrites another marker");
            }
            redis.delete(plan.keys());
            try (var connection = factory.getConnection()) { connection.serverCommands().setConfig("maxmemory-policy", "allkeys-lru"); }
            rejected(() -> PrepareServiceAdmission.apply(plan, endpoint), "Noeviction is mandatory");
            check(redis.countExistingKeys(plan.keys()) == 0, "Policy refusal writes no admission state");
        } finally { factory.destroy(); }
    }

    private static List<String> snapshot(StringRedisTemplate redis, List<String> keys) {
        return keys.stream().map(key -> Base64.getEncoder().encodeToString(redis.dump(key))).toList();
    }

    private static void check(boolean condition, String name) {
        if (!condition) throw new AssertionError(name);
        checks++;
    }

    private static void rejected(Callable<?> action, String name) throws Exception {
        try { action.call(); throw new AssertionError(name); }
        catch (PrepareServiceAdmission.Refused expected) { checks++; }
    }

    private static final class OwnedRedis implements AutoCloseable {
        private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
        final String name = "reserve-service-helper-test-" + UUID.randomUUID();
        final String password = UUID.randomUUID().toString() + UUID.randomUUID();
        final int port;
        private boolean owned;

        OwnedRedis() throws Exception {
            String owner = System.getenv("RESERVE_ISOLATED_TEST_OWNER");
            if (owner == null) owner = UUID.randomUUID().toString().replace("-", "");
            if (!owner.matches("[a-f0-9]{32}")) throw new IllegalStateException("Invalid isolated fixture owner");
            try {
                command(null, "run", "--pull=never", "--rm", "-d", "--name", name, "--label", "reserve.fixture=service-admission-helper",
                        "--label", "kr.it.reserve.isolated-test-owner=" + owner,
                        "--user", "999:999", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=128m", "--pids-limit=64",
                        "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999", "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                        "-p", "127.0.0.1::6379", IMAGE, "sh", "-c", "while [ ! -f /tmp/test.conf ]; do sleep 0.1; done; exec redis-server /tmp/test.conf");
                owned = true;
                command("bind 0.0.0.0\nprotected-mode yes\nrequirepass " + password + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n",
                        "exec", "-i", name, "sh", "-c", "umask 077; cat > /tmp/test.next && mv /tmp/test.next /tmp/test.conf");
                String published = command(null, "port", name, "6379/tcp").trim();
                if (!published.matches("127\\.0\\.0\\.1:[0-9]+")) throw new IllegalStateException("Owned helper Redis is not loopback-only");
                port = Integer.parseInt(published.substring(published.lastIndexOf(':')+1));
            } catch (Exception failure) { close(); throw failure; }
        }

        private String command(String input, String... args) throws Exception {
            var command = new ArrayList<String>(); command.add("docker"); command.addAll(List.of(args));
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            try {
                if (input != null) process.getOutputStream().write(input.getBytes(StandardCharsets.UTF_8));
                process.getOutputStream().close();
                if (!process.waitFor(20, TimeUnit.SECONDS)) throw new IllegalStateException("Owned helper Redis command timed out");
                if (process.exitValue() != 0) throw new IllegalStateException("Owned helper Redis command failed");
                return new String(process.getInputStream().readNBytes(16384), StandardCharsets.UTF_8);
            } finally { if (process.isAlive()) process.destroyForcibly(); }
        }

        @Override public void close() throws Exception { if (owned) { command(null, "stop", name); owned = false; } }
    }
}
