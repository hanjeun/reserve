package kr.it.reserve.reservation.admission;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Owns one memory-only loopback Redis. Never flushes or opens the application's Redis. */
@EnabledIfEnvironmentVariable(named = "RESERVE_ADMISSION_REDIS_TEST", matches = "1")
@Timeout(45)
class AdmissionRedisIntegrationTest {
    private static final String IMAGE = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2";
    private static final String NAME = "reserve-admission-test-" + UUID.randomUUID().toString().substring(0, 8);
    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate redis;
    private static boolean owned;
    private AdmissionService admission;
    private AdmissionProperties.Campaign campaign;

    private static String ownerLabel() {
        String owner = System.getenv("RESERVE_ISOLATED_TEST_OWNER");
        if (owner != null && !owner.matches("[0-9a-f]{32}")) throw new IllegalArgumentException("Invalid isolated fixture owner");
        return owner == null ? NAME : owner;
    }

    @BeforeAll static void start() throws Exception {
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
        factory.afterPropertiesSet(); factory.start();
        redis = new StringRedisTemplate(factory); redis.afterPropertiesSet();
        for (int i = 0; i < 50; i++) {
            try (var connection = factory.getConnection()) { if ("PONG".equals(connection.ping())) return; }
            catch (RuntimeException ignored) { Thread.sleep(50); }
        }
        throw new IllegalStateException("Disposable admission Redis did not start");
    }
    @AfterAll static void stop() throws Exception {
        try { if (factory != null) factory.destroy(); }
        finally { if (owned) command(null, "stop", NAME); }
    }
    @BeforeEach void campaign() {
        var properties = new AdmissionProperties(); properties.setEnabled(true);
        campaign = new AdmissionProperties.Campaign();
        campaign.setId("test-" + UUID.randomUUID().toString().substring(0, 8));
        campaign.setEpoch(UUID.randomUUID().toString()); campaign.setStoreId(1L);
        campaign.setDate(LocalDate.of(2030,1,1)); campaign.setTime(LocalTime.NOON);
        campaign.setOpensAt(Instant.now().minusSeconds(10)); campaign.setClosesAt(Instant.now().plusSeconds(3600));
        campaign.setConcurrent(3); properties.setCampaigns(List.of(campaign)); properties.validate();
        var beans = new StaticListableBeanFactory(); beans.addBean("redis", redis); beans.addBean("scope", RedisNamespace.LOCAL);
        admission = new AdmissionService(properties, beans.getBeanProvider(StringRedisTemplate.class), beans.getBeanProvider(RedisNamespace.class));
        redis.opsForValue().set(admission.prefix(campaign) + "marker", AdmissionService.marker(campaign));
    }

    @Test void concurrentJoinNeverExceedsLimitAndRepeatedJoinKeepsTheTicket() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        var calls = new ArrayList<Future<AdmissionService.Status>>();
        try (var pool = Executors.newFixedThreadPool(8)) {
            for (long id = 1; id <= 40; id++) { final long member = id; calls.add(pool.submit(() -> { start.await(); return admission.join(campaign.getId(), member); })); }
            start.countDown();
            int admitted = 0;
            for (var call : calls) if ("ADMITTED".equals(call.get(15, TimeUnit.SECONDS).state())) admitted++;
            assertThat(admitted).isEqualTo(3);
        }
        assertThat(redis.opsForZSet().zCard(admission.prefix(campaign)+"leases")).isEqualTo(3);
        var existing = calls.getFirst().get();
        assertThat(admission.join(campaign.getId(), 1L).ticket()).isEqualTo(existing.ticket());
    }
    @Test void fifoCancelAndExpiryPromoteTheNextMember() {
        campaign.setConcurrent(1); redis.opsForValue().set(admission.prefix(campaign)+"marker", AdmissionService.marker(campaign));
        var first = admission.join(campaign.getId(), 1L);
        var second = admission.join(campaign.getId(), 2L);
        var third = admission.join(campaign.getId(), 3L);
        assertThat(second.position()).isEqualTo(1); assertThat(third.position()).isEqualTo(2);
        admission.cancel(campaign.getId(), 1L, first.ticket());
        assertThat(admission.status(campaign.getId(), 2L, second.ticket()).state()).isEqualTo("ADMITTED");
        redis.opsForZSet().add(admission.prefix(campaign)+"leases", second.ticket(), 1);
        assertThat(admission.status(campaign.getId(), 3L, third.ticket()).state()).isEqualTo("ADMITTED");
        assertThat(admission.status(campaign.getId(), 2L, second.ticket()).state()).isEqualTo("EXPIRED");
    }
    @Test void anotherMemberCannotClaimAndOneTicketCannotBeClaimedTwice() {
        var ticket = admission.join(campaign.getId(), 1L).ticket();
        assertThatThrownBy(() -> admission.claim(campaign, 2L, ticket, UUID.randomUUID().toString())).isInstanceOf(ReservationException.class);
        var claim = admission.claim(campaign, 1L, ticket, UUID.randomUUID().toString());
        assertThatThrownBy(() -> admission.claim(campaign, 1L, ticket, UUID.randomUUID().toString())).isInstanceOf(ReservationException.class);
        admission.finish(claim, false);
        var retry = admission.claim(campaign, 1L, ticket, UUID.randomUUID().toString());
        admission.finish(retry, true);
        assertThat(admission.status(campaign.getId(), 1L, ticket).state()).isEqualTo("CONSUMED");
        assertThatThrownBy(() -> admission.claim(campaign, 1L, ticket, UUID.randomUUID().toString())).isInstanceOf(ReservationException.class);
    }
    @Test void missingOrChangedRedisIdentityFailsClosed() {
        var status = admission.join(campaign.getId(), 1L);
        redis.delete(admission.prefix(campaign)+"marker");
        assertThatThrownBy(() -> admission.status(campaign.getId(), 1L, status.ticket())).isInstanceOf(ReservationException.class);
        assertThatThrownBy(() -> admission.join(campaign.getId(), 2L)).isInstanceOf(ReservationException.class);
    }

    @Test void unvisitedExpiredTicketsCannotBeRevivedBeyondTheBoundedCleanupBatch() {
        campaign.setConcurrent(150);
        redis.opsForValue().set(admission.prefix(campaign)+"marker", AdmissionService.marker(campaign));
        var tickets = new ArrayList<AdmissionService.Status>();
        for (long member=1; member<=150; member++) tickets.add(admission.join(campaign.getId(), member));
        String prefix = admission.prefix(campaign);
        for (var status : tickets) redis.opsForZSet().add(prefix+"leases", status.ticket(), 1);
        var target = tickets.stream().max(java.util.Comparator.comparing(AdmissionService.Status::ticket)).orElseThrow();
        long member = tickets.indexOf(target) + 1L;
        assertThatThrownBy(() -> admission.claim(campaign, member, target.ticket(), UUID.randomUUID().toString())).isInstanceOf(ReservationException.class);
        assertThat(redis.opsForHash().get(prefix+"states", target.ticket())).isNull();
    }

    @Test void consumedTicketsDoNotCountAgainstTheActiveWaitingLimit() {
        campaign.setConcurrent(1); campaign.setMaxWaiting(1);
        redis.opsForValue().set(admission.prefix(campaign)+"marker", AdmissionService.marker(campaign));
        for (long member=1; member<=3; member++) {
            var ticket = admission.join(campaign.getId(), member);
            assertThat(ticket.state()).isEqualTo("ADMITTED");
            admission.finish(admission.claim(campaign, member, ticket.ticket(), UUID.randomUUID().toString()), true);
        }
    }

    @Test void aNewBookingJoinsBehindExistingWaitersWithoutRevivingItsConsumedReceipt() {
        campaign.setConcurrent(1);
        redis.opsForValue().set(admission.prefix(campaign)+"marker", AdmissionService.marker(campaign));
        var first = admission.join(campaign.getId(), 1L);
        var second = admission.join(campaign.getId(), 2L);
        admission.finish(admission.claim(campaign, 1L, first.ticket(), UUID.randomUUID().toString()), true);
        assertThat(admission.status(campaign.getId(), 2L, second.ticket()).state()).isEqualTo("ADMITTED");

        var nextBooking = admission.join(campaign.getId(), 1L);
        assertThat(nextBooking.state()).isEqualTo("WAITING");
        assertThat(nextBooking.position()).isEqualTo(1);
        assertThat(nextBooking.ticket()).isNotEqualTo(first.ticket());
        assertThat(admission.join(campaign.getId(), 1L).ticket()).isEqualTo(nextBooking.ticket());
        assertThat(admission.status(campaign.getId(), 1L, first.ticket()).state()).isEqualTo("CONSUMED");
        assertThatThrownBy(() -> admission.claim(campaign, 1L, first.ticket(), UUID.randomUUID().toString()))
                .isInstanceOf(ReservationException.class);

        admission.cancel(campaign.getId(), 1L, nextBooking.ticket());
        var retry = admission.join(campaign.getId(), 1L);
        assertThat(retry.ticket()).isNotIn(first.ticket(), nextBooking.ticket());
        assertThat(admission.status(campaign.getId(), 1L, first.ticket()).state()).isEqualTo("CONSUMED");
    }

    @Test void rollbackCannotExtendTheOriginalAdmissionDeadline() {
        var ticket = admission.join(campaign.getId(), 1L);
        double original = redis.opsForZSet().score(admission.prefix(campaign)+"leases", ticket.ticket());
        var claim = admission.claim(campaign, 1L, ticket.ticket(), UUID.randomUUID().toString());
        admission.finish(claim, false);
        assertThat(redis.opsForZSet().score(admission.prefix(campaign)+"leases", ticket.ticket())).isEqualTo(original);
    }

    private static String command(String stdin, String... args) throws Exception {
        var cmd = new ArrayList<String>(); cmd.add("docker"); cmd.addAll(List.of(args));
        var process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        try {
            if (stdin != null) process.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            if (!process.waitFor(15, TimeUnit.SECONDS)) throw new IllegalStateException("Disposable Redis command timed out");
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable Redis command failed");
            return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } finally { process.destroyForcibly(); }
    }
}
