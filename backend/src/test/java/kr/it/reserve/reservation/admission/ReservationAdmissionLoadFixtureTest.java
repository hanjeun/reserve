package kr.it.reserve.reservation.admission;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.lettuce.core.resource.ClientResources;
import io.lettuce.core.resource.DefaultClientResources;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.service.PortoneService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryFlag;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 외부 작업·요청 제한 정책을 제외한 시험 전용 HTTP 실험이에요. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "server.env=local", "reserve.redis.enabled=false"})
@EnabledIfEnvironmentVariable(named = "RESERVE_ADMISSION_LOAD_TEST", matches = "1")
@Import(ReservationAdmissionLoadFixtureTest.LoadConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ReservationAdmissionLoadFixtureTest extends ReservationAdmissionMySqlTest {
    private static final String KIND = "reserve-reservation-admission-synthetic-v1";
    private static final String IDENTITY_PATH = "/__reserve_load_fixture__/identity";
    private static final int CAPACITY = 3;
    private static final int CONCURRENT = 2;
    private static final int ACCOUNTS = 10;
    private static final String K6_EXECUTABLE_SHA = "efec04c36452cfb9c0ef313082c021e5656caf5004f922c2d8b807fdf4a0e02f";
    private static final List<String> REDIS_SUFFIXES = List.of("waiting", "leases", "heartbeats", "owners", "members", "states", "claims", "sequence", "marker");

    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired TokenProvider tokens;
    @Autowired AdmissionProperties campaigns;
    @Autowired AdmissionService admission;
    @Autowired StringRedisTemplate redis;
    @Autowired OwnedRedis ownedRedis;
    @Autowired FixtureState state;
    @MockitoBean RateLimiter rateLimiter;
    @MockitoBean PortoneService portone;
    @MockitoBean FileStorageService storage;

    @DynamicPropertySource
    static void loadFence(DynamicPropertyRegistry ignored) {
        String url = System.getenv("RESERVE_ADMISSION_MYSQL_URL");
        if (!"1".equals(System.getenv("RESERVE_ADMISSION_MYSQL_TEST"))
                || url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:23319/reserve_release_admission_[a-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("Load fixture requires the dedicated disposable loopback MySQL fence");
        }
    }

    @Test
    @Timeout(300)
    void syntheticHttpProfilesKeepCapacityAndIdempotency() throws Exception {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        var factory = (LettuceConnectionFactory) redis.getConnectionFactory();
        assertThat(factory.getHostName()).isEqualTo("127.0.0.1");
        assertThat(factory.getPort()).isEqualTo(ownedRedis.port);
        try (var connection = factory.getConnection()) {
            assertThat(connection.serverCommands().getConfig("maxmemory-policy").getProperty("maxmemory-policy")).isEqualTo("noeviction");
        }
        when(rateLimiter.tryConsume(anyString(), any(RateLimiter.Policy.class))).thenReturn(true);
        store.setMaxCapacityPerSlot(CAPACITY);
        stores.saveAndFlush(store);
        while (customers.size() < ACCOUNTS) customers.add(members.saveAndFlush(Member.builder()
                .name("synthetic-load").email("admission-load-" + UUID.randomUUID() + "@example.test")
                .role(Role.USER).termsAgreed(true).build()));
        var accessCookies = new ArrayList<Map<String, Object>>();
        for (var member : customers) {
            // 기기 세션은 access·refresh를 함께 등록하되 이 메서드는 access만 내보내요.
            var issued = tokens.issueSession(member, null);
            accessCookies.add(Map.of("synthetic", true, "cookies", Map.of("access_token", issued.accessToken())));
        }
        Path directory = Files.createTempDirectory("reserve-admission-load-");
        privatePermissions(directory, true);
        Path attestation = directory.resolve("attestation.json");
        Path cookies = directory.resolve("cookies.json");
        var prefixes = new ArrayList<String>();
        try {
            for (String scenario : List.of("queue-open", "queue-status", "booking-idempotency")) {
                var campaign = campaign();
                String prefix = admission.prefix(campaign);
                prefixes.add(prefix);
                redis.opsForValue().set(prefix + "marker", AdmissionService.marker(campaign));
                var identity = identity(campaign);
                state.identity.set(Map.copyOf(identity));
                writePrivate(attestation, Map.of("schemaVersion", 1, "identity", identity));
                var credentials = new LinkedHashMap<String, Object>();
                credentials.put("schemaVersion", 1);
                credentials.put("purpose", KIND);
                for (String field : List.of("fixtureId", "nonce", "origin", "expiresAt")) credentials.put(field, identity.get(field));
                credentials.put("accounts", accessCookies);
                writePrivate(cookies, credentials);

                JsonNode result = runProfile(scenario, attestation, cookies);
                // 실행 결과는 사전에 허용한 집계 항목만 출력해요.
                System.out.println("ISOLATED_LOAD " + mapper.writeValueAsString(Map.of(
                        "scope", "test-only-rate-limit-policy-and-external-effects-excluded",
                        "capacity", CAPACITY, "concurrent", CONCURRENT, "accounts", ACCOUNTS, "result", result)));
                assertThat(result.path("executed").asBoolean()).as("A real k6 run must return its sanitized summary").isTrue();
                assertThat(result.path("status").asText()).as("All required experiment samples must be measured").isEqualTo("MEASURED");
                assertThat(result.path("exitCode").asInt(-1)).as("k6 must complete successfully").isZero();
                assertThat(result.path("summary").path("thresholdsPassed").asBoolean())
                        .as("Original provisional targets must pass").isTrue();
                JsonNode metrics = result.path("summary").path("metrics");
                assertThat(metrics.path("requests_completed").path("count").asLong()).isPositive();
                assertThat(metrics.path("idempotency_mismatches").path("count").asLong()).isZero();
                assertThat(metrics.path("dropped_iterations").has("count")).as("Missing drop telemetry is not zero").isTrue();
                assertThat(metrics.path("dropped_iterations").path("count").asLong()).isZero();
                if (scenario.equals("booking-idempotency")) {
                    assertThat(metrics.path("booking_confirmed_pairs").path("count").asLong()).isPositive();
                }
                assertThat(redis.opsForZSet().zCard(prefix + "leases")).isLessThanOrEqualTo(CONCURRENT);
                state.identity.set(null);
                campaigns.setEnabled(false);
            }
            int booked = jdbc.queryForObject("SELECT COUNT(*) FROM reservation WHERE store_id = ?", Integer.class, store.getId());
            int seats = jdbc.queryForObject("SELECT COALESCE(SUM(guest_count), 0) FROM reservation WHERE store_id = ? AND status IN ('PENDING','CONFIRMED')", Integer.class, store.getId());
            int results = jdbc.queryForObject("SELECT COUNT(*) FROM reservation_request rr JOIN reservation r ON r.reservation_id = rr.reservation_id WHERE r.store_id = ?", Integer.class, store.getId());
            assertThat(booked).isBetween(1, CAPACITY);
            assertThat(seats).isBetween(1, CAPACITY);
            assertThat(results).isEqualTo(booked);
            for (var member : customers) {
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM (SELECT request_key FROM reservation_request WHERE member_id = ? GROUP BY request_key HAVING COUNT(*) > 1) duplicated", Integer.class, member.getId())).isZero();
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment WHERE reservation_id IN (SELECT reservation_id FROM reservation WHERE store_id = ?)", Integer.class, store.getId())).isZero();
            verifyNoInteractions(portone, storage, emails);
            System.out.println("ISOLATED_LOAD_DB " + mapper.writeValueAsString(Map.of("reservations", booked, "activeGuests", seats,
                    "idempotencyResults", results, "capacity", CAPACITY, "externalEffects", "not-called", "rateLimitPolicy", "excluded")));
        } finally {
            state.identity.set(null);
            campaigns.setEnabled(false);
            campaigns.setCampaigns(List.of());
            for (String prefix : prefixes) redis.delete(REDIS_SUFFIXES.stream().map(suffix -> prefix + suffix).toList());
            Files.deleteIfExists(cookies);
            Files.deleteIfExists(attestation);
            Files.deleteIfExists(directory);
        }
    }

    @AfterEach
    void removeOwnDeviceSessions() {
        for (var member : customers) jdbc.update("DELETE FROM login_session WHERE member_id = ?", member.getId());
    }

    private AdmissionProperties.Campaign campaign() {
        var value = new AdmissionProperties.Campaign();
        value.setId("load-" + UUID.randomUUID().toString().substring(0, 8));
        value.setEpoch(UUID.randomUUID().toString());
        value.setStoreId(store.getId());
        value.setDate(date);
        value.setTime(LocalTime.NOON);
        value.setOpensAt(Instant.now().minusSeconds(2));
        value.setClosesAt(Instant.now().plusSeconds(240));
        value.setConcurrent(CONCURRENT);
        value.setLeaseSeconds(30);
        value.setIdleSeconds(30);
        value.setMaxWaiting(100);
        campaigns.setCampaigns(List.of(value));
        campaigns.setEnabled(true);
        campaigns.validate();
        return value;
    }

    private Map<String, Object> identity(AdmissionProperties.Campaign campaign) {
        Instant issued = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        var value = new LinkedHashMap<String, Object>();
        value.put("schemaVersion", 1); value.put("kind", KIND);
        value.put("fixtureId", UUID.randomUUID().toString()); value.put("nonce", UUID.randomUUID().toString());
        value.put("origin", "http://127.0.0.1:" + port);
        value.put("issuedAt", issued.toString()); value.put("expiresAt", issued.plusSeconds(600).toString());
        value.put("database", "disposable"); value.put("redis", "disposable");
        value.put("paymentProvider", "disabled"); value.put("externalEffects", "blocked");
        value.put("syntheticAccountsOnly", true); value.put("storeId", store.getId());
        value.put("campaignId", campaign.getId()); value.put("reservationDate", date.toString());
        value.put("reservationTime", "12:00"); value.put("guestCount", 1); value.put("slotCapacity", CAPACITY);
        return value;
    }

    private void writePrivate(Path file, Object value) throws IOException {
        if (!Files.exists(file)) { Files.createFile(file); privatePermissions(file, false); }
        Files.writeString(file, mapper.writeValueAsString(value), StandardCharsets.UTF_8);
    }

    private static void privatePermissions(Path file, boolean directory) throws IOException {
        var acl = Files.getFileAttributeView(file, AclFileAttributeView.class, LinkOption.NOFOLLOW_LINKS);
        if (acl != null) {
            var user = file.getFileSystem().getUserPrincipalLookupService().lookupPrincipalByName(System.getProperty("user.name"));
            var builder = AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(user)
                    .setPermissions(EnumSet.allOf(AclEntryPermission.class));
            if (directory) builder.setFlags(AclEntryFlag.FILE_INHERIT, AclEntryFlag.DIRECTORY_INHERIT);
            acl.setAcl(List.of(builder.build()));
        } else Files.setPosixFilePermissions(file, PosixFilePermissions.fromString(directory ? "rwx------" : "rw-------"));
    }

    private JsonNode runProfile(String scenario, Path attestation, Path cookies) throws Exception {
        Path repository = Path.of("").toAbsolutePath();
        if (repository.getFileName().toString().equals("backend")) repository = repository.getParent();
        Path node = Path.of(System.getProperty("user.home"), ".cache", "reserve-node", "v22.23.4", "node.exe");
        Path k6 = Path.of(System.getProperty("user.home"), ".cache", "reserve-k6", "v2.3.0", "k6-v2.3.0-windows-amd64", "k6.exe");
        assertThat(Files.isRegularFile(node, LinkOption.NOFOLLOW_LINKS)).as("Pinned portable Node is required").isTrue();
        assertThat(Files.isRegularFile(k6, LinkOption.NOFOLLOW_LINKS)).as("Checksum-verified portable k6 is required at %s", k6).isTrue();
        assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(k6)))).isEqualTo(K6_EXECUTABLE_SHA);
        var builder = new ProcessBuilder(node.toString(), repository.resolve("scripts/load/run-reservation-admission.mjs").toString(),
                "--run-synthetic-load", "--origin", "http://127.0.0.1:" + port, "--fixture", attestation.toString(), "--cookies", cookies.toString(),
                "--scenario", scenario, "--rate", "2", "--duration-seconds", "8", "--vus", Integer.toString(ACCOUNTS));
        builder.directory(repository.toFile()).redirectErrorStream(true);
        var env = builder.environment();
        String currentPath = env.getOrDefault("PATH", env.getOrDefault("Path", ""));
        env.clear();
        env.put("PATH", k6.getParent() + java.io.File.pathSeparator + currentPath);
        env.put("SystemRoot", "C:\\Windows"); env.put("WINDIR", "C:\\Windows");
        env.put("TEMP", System.getProperty("java.io.tmpdir")); env.put("TMP", System.getProperty("java.io.tmpdir"));
        Process process = builder.start();
        var output = CompletableFuture.supplyAsync(() -> {
            try { return process.getInputStream().readNBytes(1024 * 1024 + 1); }
            catch (IOException exception) { throw new IllegalStateException("Isolated runner output unavailable"); }
        });
        try {
            if (!process.waitFor(150, TimeUnit.SECONDS)) throw new IllegalStateException("Isolated k6 experiment timed out");
            byte[] bytes = output.get(5, TimeUnit.SECONDS);
            if (bytes.length > 1024 * 1024) throw new IllegalStateException("Isolated runner output exceeded its limit");
            try { return mapper.readTree(bytes); }
            catch (Exception exception) { throw new IllegalStateException("Isolated runner did not return a sanitized JSON result"); }
        } finally {
            process.descendants().forEach(child -> { child.destroy(); if (child.isAlive()) child.destroyForcibly(); });
            if (process.isAlive()) { process.destroy(); if (!process.waitFor(3, TimeUnit.SECONDS)) process.destroyForcibly(); }
        }
    }

    static final class FixtureState {
        final AtomicReference<Map<String, Object>> identity = new AtomicReference<>();
    }

    @TestComponent
    @RestController
    static final class IdentityController {
        private final FixtureState state;
        IdentityController(FixtureState state) { this.state = state; }
        @GetMapping(IDENTITY_PATH)
        ResponseEntity<Map<String, Object>> identity() {
            var value = state.identity.get();
            return value == null ? ResponseEntity.status(503).build() : ResponseEntity.ok(value);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class LoadConfiguration {
        @Bean FixtureState loadFixtureState() { return new FixtureState(); }
        @Bean IdentityController loadFixtureIdentity(FixtureState state) { return new IdentityController(state); }
        @Bean @Order(0)
        SecurityFilterChain identityOnly(HttpSecurity http) throws Exception {
            return http.securityMatcher(request -> "GET".equals(request.getMethod()) && IDENTITY_PATH.equals(request.getServletPath()))
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
        @Bean(destroyMethod = "close") OwnedRedis ownedLoadRedis() throws Exception { return new OwnedRedis(); }
        @Bean(destroyMethod = "shutdown") ClientResources loadRedisResources() {
            return DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        }
        @Bean RedisNamespace loadRedisNamespace() { return RedisNamespace.LOCAL; }
        @Bean LettuceConnectionFactory loadRedisConnection(OwnedRedis server, ClientResources resources) {
            var standalone = new RedisStandaloneConfiguration("127.0.0.1", server.port);
            standalone.setPassword(server.password);
            return new LettuceConnectionFactory(standalone, LettuceClientConfiguration.builder().clientResources(resources)
                    .commandTimeout(Duration.ofSeconds(2)).shutdownTimeout(Duration.ofMillis(100)).build());
        }
        @Bean StringRedisTemplate loadRedisTemplate(LettuceConnectionFactory factory) { return new StringRedisTemplate(factory); }
    }

    static final class OwnedRedis implements AutoCloseable {
        private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
        final String name = "reserve-admission-load-" + UUID.randomUUID();
        final String password = UUID.randomUUID().toString() + UUID.randomUUID();
        final int port;
        boolean owned;
        OwnedRedis() throws Exception {
            try {
                command(null, "run", "--pull=never", "--rm", "-d", "--name", name, "--label", "reserve.fixture=admission-load",
                        "--user", "999:999", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                        "--memory=128m", "--pids-limit=64", "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                        "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999", "-p", "127.0.0.1::6379", IMAGE,
                        "sh", "-c", "while [ ! -f /tmp/test.conf ]; do sleep 0.1; done; exec redis-server /tmp/test.conf");
                owned = true;
                command("bind 0.0.0.0\nprotected-mode yes\nrequirepass " + password + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n",
                        "exec", "-i", name, "sh", "-c", "umask 077; cat > /tmp/test.next && mv /tmp/test.next /tmp/test.conf");
                String published = command(null, "port", name, "6379/tcp").trim();
                if (!published.matches("127\\.0\\.0\\.1:[0-9]+")) throw new IllegalStateException("Disposable Redis is not loopback-only");
                port = Integer.parseInt(published.substring(published.lastIndexOf(':') + 1));
            } catch (Exception failure) { close(); throw failure; }
        }
        private String command(String input, String... args) throws Exception {
            var arguments = new ArrayList<String>(); arguments.add("docker"); arguments.addAll(List.of(args));
            Process process = new ProcessBuilder(arguments).redirectErrorStream(true).start();
            if (input != null) process.getOutputStream().write(input.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            if (!process.waitFor(20, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new IllegalStateException("Disposable Redis command timed out"); }
            byte[] output = process.getInputStream().readNBytes(16384);
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable Redis command failed");
            return new String(output, StandardCharsets.UTF_8);
        }
        @Override public void close() throws Exception {
            if (owned) { command(null, "stop", name); owned = false; }
        }
    }
}
