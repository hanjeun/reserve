package kr.it.reserve.global.security.ip;

import io.lettuce.core.resource.DefaultClientResources;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RESERVE_REDIS_INTEGRATION", matches = "true")
@Timeout(45)
class IpProtectionRedisIntegrationTest {
    private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
    private static final String NAME = "reserve-ip-test-" + UUID.randomUUID().toString().substring(0, 8);
    private static String container;
    private static DefaultClientResources resources;
    private static LettuceConnectionFactory connection;
    private static LettuceConnectionFactory administrator;
    private static StringRedisTemplate admin;
    private static StringRedisTemplate redis;
    private static IpProtectionStore left, right;

    @BeforeAll static void start() throws Exception {
        container = command(null, "run", "--pull=never", "-d", "--name", NAME,
                "--label", "kr.it.reserve.isolated-test-owner=" + System.getenv().getOrDefault("RESERVE_ISOLATED_TEST_OWNER", NAME),
                "--user", "999:999", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=64",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,uid=999,gid=999",
                "--tmpfs", "/data:rw,noexec,nosuid,size=8m,uid=999,gid=999", "-p", "127.0.0.1::6379", IMAGE,
                "sh", "-c", "while [ ! -f /tmp/ip-test.conf ]; do sleep 0.1; done; exec redis-server /tmp/ip-test.conf").strip();
        if (!container.matches("[0-9a-f]{64}")) throw new IllegalStateException("Invalid disposable container identity");
        String password = UUID.randomUUID().toString() + UUID.randomUUID();
        String appPassword = UUID.randomUUID().toString() + UUID.randomUUID();
        String rules = Files.readString(Path.of("../scripts/redis-app.rules")).replace("reserve:prod:", "reserve:local:").replaceAll("\\s+", " ").strip();
        command("user default reset on #" + hash(password) + " ~* &* +@all\nuser reserve_app " + rules + " #" + hash(appPassword) + "\n",
                "exec", "-i", container, "sh", "-c", "umask 077; cat > /tmp/app-test.acl");
        command("bind 0.0.0.0\nprotected-mode yes\nport 6379\nrequirepass " + password
                        + "\naclfile /tmp/app-test.acl\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n",
                "exec", "-i", container, "sh", "-c", "umask 077; cat > /tmp/ip-test.next && mv /tmp/ip-test.next /tmp/ip-test.conf");
        String address = command(null, "port", container, "6379/tcp").strip();
        if (!address.matches("127\\.0\\.0\\.1:[0-9]+")) throw new IllegalStateException("Disposable Redis must use loopback");
        var endpoint = new RedisStandaloneConfiguration("127.0.0.1", Integer.parseInt(address.substring(address.lastIndexOf(':') + 1)));
        endpoint.setPassword(appPassword);
        endpoint.setUsername("reserve_app");
        resources = DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        var client = LettuceClientConfiguration.builder().clientResources(resources).commandTimeout(Duration.ofMillis(500))
                .shutdownTimeout(Duration.ofMillis(100)).build();
        connection = new LettuceConnectionFactory(endpoint, client);
        connection.afterPropertiesSet(); connection.start();
        redis = new StringRedisTemplate(connection);
        var adminEndpoint = new RedisStandaloneConfiguration(endpoint.getHostName(), endpoint.getPort());
        adminEndpoint.setPassword(password);
        administrator = new LettuceConnectionFactory(adminEndpoint, client);
        administrator.afterPropertiesSet(); administrator.start();
        admin = new StringRedisTemplate(administrator);
        boolean ready = false;
        for (int attempt = 0; attempt < 50; attempt++) {
            try (var probe = connection.getConnection()) { ready = "PONG".equals(probe.ping()); }
            catch (RuntimeException starting) { Thread.sleep(100); }
            if (ready) break;
        }
        assertThat(ready).isTrue();
        left = new IpProtectionStore(redis, RedisNamespace.LOCAL, new RedisFailureBackoff());
        right = new IpProtectionStore(redis, RedisNamespace.LOCAL, new RedisFailureBackoff());
    }
    @AfterAll static void stop() throws Exception {
        if (connection != null) connection.destroy();
        if (administrator != null) administrator.destroy();
        if (resources != null) resources.shutdown().syncUninterruptibly();
        if (container != null && container.matches("[0-9a-f]{64}")) command(null, "rm", "-f", container);
    }
    private static String key(String id, String kind) { return RedisNamespace.LOCAL.prefix() + "ip-protection:{" + id + "}:" + kind; }
    private static String id() { return UUID.randomUUID().toString().replace("-", ""); }
    private static String hash(String value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    @BeforeEach void resetBackoff() {
        left = new IpProtectionStore(redis, RedisNamespace.LOCAL, new RedisFailureBackoff());
        right = new IpProtectionStore(redis, RedisNamespace.LOCAL, new RedisFailureBackoff());
    }

    private static Object adminCommand(String... parts) {
        return admin.execute((org.springframework.data.redis.core.RedisCallback<Object>) session -> session.execute(parts[0],
                java.util.Arrays.stream(parts).skip(1).map(value -> value.getBytes(StandardCharsets.UTF_8)).toArray(byte[][]::new)));
    }

    @Test void restrictedIdentityRejectsOtherNamespacesAndAdministrationButKeepsRelays() {
        assertThatThrownBy(() -> redis.opsForValue().get("reserve:prod:synthetic-denied")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> { try (var session = connection.getConnection()) { session.serverCommands().getConfig("maxmemory"); } })
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        var limits = new kr.it.reserve.global.ratelimit.RedisRequestLimiter(redis, new RedisFailureBackoff());
        assertThat(limits.tryConsume("synthetic-account", kr.it.reserve.global.ratelimit.RateLimiter.Policy.LOGIN, 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limits.tryConsume("synthetic-account", kr.it.reserve.global.ratelimit.RateLimiter.Policy.LOGIN, 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limits.tryConsume("synthetic-account", kr.it.reserve.global.ratelimit.RateLimiter.Policy.LOGIN, 2, Duration.ofMinutes(1))).isFalse();
        assertThat(redis.convertAndSend("reserve:local:synthetic-refresh", "refresh")).isNotNull();
        assertThatThrownBy(() -> redis.convertAndSend("reserve:prod:synthetic-refresh", "refresh"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test void missingCachedScriptReloadsWithinTheRestrictedAcl() {
        String member = id();
        left.remember(member, "synthetic-network");
        adminCommand("SCRIPT", "FLUSH");
        assertThat(right.known(member, "synthetic-network")).isTrue();
    }

    @Test void restrictedIdentitySupportsExistingSubscriptionsAndServiceAdmission() throws Exception {
        String channel = "reserve:local:synthetic-refresh:" + id();
        var received = new CountDownLatch(1);
        var listener = new org.springframework.data.redis.listener.RedisMessageListenerContainer();
        listener.setConnectionFactory(connection);
        listener.addMessageListener((message, pattern) -> received.countDown(), new org.springframework.data.redis.listener.ChannelTopic(channel));
        listener.afterPropertiesSet();
        try {
            listener.start();
            redis.convertAndSend(channel, "refresh");
            assertThat(received.await(5, TimeUnit.SECONDS)).isTrue();
        } finally { listener.stop(); listener.destroy(); }
        var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        beans.registerSingleton("redis", redis);
        beans.registerSingleton("namespace", RedisNamespace.LOCAL);
        var properties = new kr.it.reserve.global.admission.ServiceAdmissionProperties();
        properties.setEnabled(true); properties.setEpoch(id());
        var service = new kr.it.reserve.global.admission.ServiceAdmissionService(properties,
                beans.getBeanProvider(StringRedisTemplate.class), beans.getBeanProvider(RedisNamespace.class));
        admin.opsForHash().putAll(service.prefix() + "control", java.util.Map.of("marker",
                kr.it.reserve.global.admission.ServiceAdmissionService.marker(properties), "mode", "CORE"));
        var entry = service.join(null);
        assertThat(entry.ticket()).isNotBlank();
        assertThat(service.admitted(entry.ticket())).isTrue();
        service.cancel(entry.ticket());
        assertThat(admin.opsForZSet().zCard(service.prefix() + "active")).isZero();
    }

    @Test void permissionFailureDoesNotCreateTrustAndRecoversAfterBackoff() throws Exception {
        String member = id();
        adminCommand("ACL", "SETUSER", "reserve_app", "-zadd");
        try { assertThatThrownBy(() -> left.remember(member, "synthetic-network")).isInstanceOf(IpProtectionStore.Unavailable.class); }
        finally { adminCommand("ACL", "SETUSER", "reserve_app", "+zadd"); }
        assertThat(right.known(member, "synthetic-network")).isFalse();
        Thread.sleep(5_100);
        left.remember(member, "synthetic-network");
        assertThat(left.known(member, "synthetic-network")).isTrue();
    }

    @Test void memoryExhaustionDoesNotEvictTrustAndFailsInsteadOfAllowingUnknownLogin() {
        String member = id();
        left.remember(member, "synthetic-network");
        adminCommand("CONFIG", "SET", "maxmemory", "1");
        try { assertThatThrownBy(() -> right.remember(id(), "another-network")).isInstanceOf(IpProtectionStore.Unavailable.class); }
        finally { adminCommand("CONFIG", "SET", "maxmemory", "67108864"); }
        assertThat(left.known(member, "synthetic-network")).isTrue();
    }

    @Test void connectionLossUsesBoundedTimeoutAndRecoversWithoutTrustingMissingHistory() throws Exception {
        String member = id();
        left.remember(member, "synthetic-network");
        command(null, "pause", container);
        try { assertThatThrownBy(() -> left.known(member, "synthetic-network")).isInstanceOf(IpProtectionStore.Unavailable.class); }
        finally { command(null, "unpause", container); }
        Thread.sleep(5_100);
        assertThat(left.known(member, "synthetic-network")).isTrue();
        admin.delete(key(member, "known"));
        assertThat(left.known(member, "synthetic-network")).isFalse();
    }

    @Test void twoInstancesShareFiniteBlocksAndRejectedRetriesCannotExtendThem() throws Exception {
        String network = id();
        for (int i = 0; i < 19; i++) (i % 2 == 0 ? left : right).failed(network);
        assertThat(left.blocked(network)).isZero();
        right.failed(network);
        long initial = left.blocked(network);
        assertThat(initial).isBetween(850_000L, 900_000L);
        right.failed(network);
        assertThat(left.blocked(network)).isPositive().isLessThanOrEqualTo(initial);
        redis.expire(key(network, "block"), Duration.ofMillis(1));
        Thread.sleep(10);
        assertThat(right.blocked(network)).isZero();
        for (int i = 0; i < 20; i++) left.failed(network);
        assertThat(right.blocked(network)).isBetween(3_550_000L, 3_600_000L);
    }
    @Test void concurrentFailuresCreateOneFirstBlock() throws Exception {
        String network = id();
        for (int i = 0; i < 18; i++) left.failed(network);
        var start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> { start.await(); left.failed(network); return true; });
            var second = workers.submit(() -> { start.await(); right.failed(network); return true; });
            start.countDown(); first.get(5, TimeUnit.SECONDS); second.get(5, TimeUnit.SECONDS);
        }
        assertThat(left.blocked(network)).isBetween(850_000L, 900_000L);
        assertThat(redis.opsForValue().get(key(network, "strikes"))).isEqualTo("1");
    }
    @Test void codeIsBoundSingleUseAndDoesNotExtendTheChallengeLifetime() throws Exception {
        String ticket = id();
        left.bind(ticket, "synthetic-binding");
        long originalTtl = redis.getExpire(key(ticket, "challenge"), TimeUnit.MILLISECONDS);
        assertThat(right.binding(ticket, "synthetic-binding")).isTrue();
        assertThat(right.binding(ticket, "another-binding")).isFalse();
        assertThat(left.issueCode(ticket, "synthetic-binding", "synthetic-code-hash")).isEqualTo(1);
        assertThat(right.issueCode(ticket, "synthetic-binding", "another-code-hash")).isEqualTo(-2);
        assertThat(right.verifyCode(ticket, "another-binding", "synthetic-code-hash")).isFalse();
        var start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> { start.await(); return left.verifyCode(ticket, "synthetic-binding", "synthetic-code-hash"); });
            var second = workers.submit(() -> { start.await(); return right.verifyCode(ticket, "synthetic-binding", "synthetic-code-hash"); });
            start.countDown();
            assertThat(java.util.List.of(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(redis.getExpire(key(ticket, "challenge"), TimeUnit.MILLISECONDS)).isPositive().isLessThanOrEqualTo(originalTtl);
    }
    @Test void historyHasEightEntriesAndExpiredNetworksAreNotTrusted() {
        String member = id();
        assertThat(left.known(member, "synthetic-network")).isFalse();
        for (int i = 0; i < 10; i++) left.remember(member, "synthetic-network-" + i);
        assertThat(redis.opsForZSet().zCard(key(member, "known"))).isEqualTo(8);
        redis.opsForZSet().add(key(member, "known"), "expired-network", System.currentTimeMillis() - Duration.ofDays(31).toMillis());
        assertThat(right.known(member, "expired-network")).isFalse();
        assertThat(redis.getExpire(key(member, "known"), TimeUnit.MILLISECONDS)).isPositive().isLessThanOrEqualTo(Duration.ofDays(30).toMillis());
    }
    private static String command(String input, String... args) throws Exception {
        var command = new java.util.ArrayList<String>(); command.add("docker"); command.addAll(java.util.List.of(args));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        try (var stdin = process.getOutputStream()) { if (input != null) stdin.write(input.getBytes(StandardCharsets.UTF_8)); }
        if (!process.waitFor(15, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new IllegalStateException("Disposable Redis command timed out"); }
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (process.exitValue() != 0) throw new IllegalStateException("Disposable Redis command failed: " + args[0]);
        return output;
    }
}
