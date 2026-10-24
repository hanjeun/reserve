package kr.it.reserve.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.reservation.admission.AdmissionProperties;
import kr.it.reserve.reservation.admission.AdmissionService;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

/** Standalone operator tool, never an application startup hook or a remote dots action. */
public final class PrepareAdmissionCampaign {
    private PrepareAdmissionCampaign() { }
    public static final String INITIALIZE = """
            local marker = redis.call('GET', KEYS[9])
            if marker then
              if marker == ARGV[1] then return 0 else return -1 end
            end
            for i = 1, 8 do if redis.call('EXISTS', KEYS[i]) ~= 0 then return -1 end end
            local t = redis.call('TIME')
            if tonumber(ARGV[2]) <= tonumber(t[1]) * 1000 then return -1 end
            redis.call('SET', KEYS[9], ARGV[1], 'PXAT', ARGV[2])
            return 1
            """;

    public static void main(String[] args) throws Exception {
        if (args.length < 2 || args.length > 4 || !args[0].equals("--config")) throw new IllegalArgumentException("Use --config <campaign.json> [--production] [--apply]");
        boolean apply = false;
        boolean production = false;
        for (int i = 2; i < args.length; i++) {
            if (args[i].equals("--apply") && !apply) apply = true;
            else if (args[i].equals("--production") && !production) production = true;
            else throw new IllegalArgumentException("Unsupported preparation option");
        }
        var file = Path.of(args[1]).toRealPath();
        if (!Files.isRegularFile(file) || Files.size(file) > 16384) throw new IllegalArgumentException("Invalid campaign configuration file");
        var mapper = new ObjectMapper().findAndRegisterModules();
        var campaign = mapper.readValue(Files.readString(file), AdmissionProperties.Campaign.class);
        var properties = new AdmissionProperties(); properties.setEnabled(true); properties.setCampaigns(List.of(campaign)); properties.validate();
        String prefix = (production ? RedisNamespace.PRODUCTION : RedisNamespace.LOCAL).prefix() + "admission:{" + campaign.getId() + "}:";
        String marker = AdmissionService.marker(campaign);
        if (!apply) {
            System.out.println(mapper.writeValueAsString(java.util.Map.of("state", "PREPARED_ONLY", "campaignId", campaign.getId(), "namespace", production ? "production" : "local", "marker", marker)));
            return;
        }
        String host = required("RESERVE_REDIS_HOST");
        if (production ? !internalHost(host) : !List.of("127.0.0.1", "localhost", "::1").contains(host)) throw new IllegalArgumentException("Redis endpoint does not match the explicitly selected scope");
        int port = Integer.parseInt(required("RESERVE_REDIS_PORT"));
        String password = required("RESERVE_REDIS_PASSWORD");
        if (port < 1 || port > 65535 || password.length() < 32) throw new IllegalArgumentException("Invalid dedicated Redis endpoint or password");
        var server = new RedisStandaloneConfiguration(host, port); server.setPassword(password);
        String username = System.getenv("RESERVE_REDIS_USERNAME"); if (username != null && !username.isBlank()) server.setUsername(username);
        var factory = new LettuceConnectionFactory(server, LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(2)).build());
        try {
            factory.afterPropertiesSet(); factory.start();
            var redis = new StringRedisTemplate(factory); redis.afterPropertiesSet();
            // Queue state must not be individually evicted while a marker survives.
            try (var connection = factory.getConnection()) {
                var policy = connection.serverCommands().getConfig("maxmemory-policy");
                if (policy == null || !"noeviction".equals(policy.getProperty("maxmemory-policy"))) throw new IllegalStateException("Admission Redis requires verified noeviction policy");
            }
            var script = new DefaultRedisScript<Long>(INITIALIZE, Long.class);
            Long result = redis.execute(script, List.of(prefix+"waiting", prefix+"leases", prefix+"heartbeats", prefix+"owners", prefix+"members", prefix+"states", prefix+"claims", prefix+"sequence", prefix+"marker"), marker, Long.toString(campaign.getClosesAt().plusSeconds(86400).toEpochMilli()));
            if (result == null || result < 0) throw new IllegalStateException("Existing or inconsistent admission state; automatic reset is forbidden");
            System.out.println(result == 1 ? "INITIALIZED" : "ALREADY_INITIALIZED");
        } finally { factory.destroy(); }
    }

    private static String required(String key) { String value = System.getenv(key); if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing dedicated preparation input: " + key); return value; }
    private static boolean internalHost(String host) {
        if (host.equals("redis")) return true;
        if (!host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) return false;
        int[] ip = java.util.Arrays.stream(host.split("\\.")).mapToInt(Integer::parseInt).toArray();
        if (java.util.Arrays.stream(ip).anyMatch(part -> part > 255)) return false;
        return ip[0] == 10 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] == 192 && ip[1] == 168;
    }
}
