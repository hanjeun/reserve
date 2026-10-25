package kr.it.reserve.reservation.admission;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.redis.RedisNamespace;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class AdmissionService {
    private final AdmissionProperties properties;
    private final ObjectProvider<StringRedisTemplate> redis;
    private final ObjectProvider<RedisNamespace> namespace;
    private final DefaultRedisScript<List> script = new DefaultRedisScript<>();

    public record Status(String campaignId, String state, String ticket, long position, long expiresAt,
                         long serverTime, int pollAfterSeconds, int heartbeatTimeoutSeconds) { }
    public record Claim(AdmissionProperties.Campaign campaign, Long memberId, String ticket, String requestId) { }

    public AdmissionService(AdmissionProperties properties, ObjectProvider<StringRedisTemplate> redis,
                            ObjectProvider<RedisNamespace> namespace) {
        this.properties = properties; this.redis = redis; this.namespace = namespace;
        script.setLocation(new ClassPathResource("redis/reservation-admission.lua"));
        script.setResultType(List.class);
    }

    public AdmissionProperties.Campaign match(Long storeId, LocalDate date, LocalTime time) {
        if (!properties.isEnabled()) return null;
        return properties.getCampaigns().stream().filter(c -> c.getStoreId().equals(storeId)
                && c.getDate().equals(date) && c.getTime().equals(time)).findFirst().orElse(null);
    }

    public AdmissionProperties.Campaign campaign(String id) {
        if (properties.isEnabled()) for (var c : properties.getCampaigns()) if (c.getId().equals(id)) return c;
        throw new ReservationException("입장 대기 행사를 찾을 수 없어요.", HttpStatus.NOT_FOUND);
    }

    public Status join(String id, Long member) { return call(campaign(id), "join", member, UUID.randomUUID().toString(), ""); }
    public Status status(String id, Long member, String ticket) { return call(campaign(id), "status", member, ticket, ""); }
    public Status cancel(String id, Long member, String ticket) { return call(campaign(id), "cancel", member, ticket, ""); }

    public Claim claim(AdmissionProperties.Campaign c, Long member, String ticket, String requestId) {
        if (ticket == null || requestId == null) throw new ReservationException("먼저 입장 대기 순번을 받아주세요.", HttpStatus.CONFLICT);
        var result = call(c, "claim", member, ticket, requestId);
        if (!"CLAIMED".equals(result.state())) throw new ReservationException("입장 차례가 아니거나 입장 시간이 지났어요. 대기 상태를 확인해주세요.", HttpStatus.CONFLICT);
        return new Claim(c, member, ticket, requestId);
    }

    public void finish(Claim claim, boolean committed) {
        call(claim.campaign(), committed ? "consume" : "release", claim.memberId(), claim.ticket(), claim.requestId());
    }

    public String prefix(AdmissionProperties.Campaign c) {
        var scope = namespace.getIfAvailable();
        if (scope == null) throw unavailable();
        return scope.prefix() + "admission:{" + c.getId() + "}:";
    }

    /** 설정 식별자는 별도로 준비한다. Redis가 비거나 재시작되어 상태가 없으면 입장을 허용하지 않는다. */
    public static String marker(AdmissionProperties.Campaign c) {
        String canonical = c.getId() + "|" + c.getEpoch() + "|" + c.getStoreId() + "|" + c.getDate()
                + "|" + c.getTime() + "|" + c.getOpensAt() + "|" + c.getClosesAt() + "|" + c.getConcurrent()
                + "|" + c.getLeaseSeconds() + "|" + c.getIdleSeconds() + "|" + c.getMaxWaiting() + "|" + c.getMaxParticipants();
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private Status call(AdmissionProperties.Campaign c, String action, Long member, String ticket, String request) {
        if (ticket == null || !ticket.matches("[0-9a-f-]{36}")) throw new ReservationException("입장권을 확인해주세요.");
        var template = redis.getIfAvailable();
        if (template == null) throw unavailable();
        String p = prefix(c);
        List<?> result;
        try {
            result = template.execute(script, List.of(p+"waiting", p+"leases", p+"heartbeats", p+"owners", p+"members", p+"states", p+"claims", p+"sequence", p+"marker"),
                    action, member.toString(), ticket, request, marker(c), Long.toString(c.getOpensAt().toEpochMilli()),
                    Long.toString(c.getClosesAt().toEpochMilli()), Integer.toString(c.getConcurrent()),
                    Long.toString(c.getLeaseSeconds()*1000L), Long.toString(c.getIdleSeconds()*1000L), Integer.toString(c.getMaxWaiting()), Integer.toString(c.getMaxParticipants()));
        } catch (org.springframework.dao.DataAccessException e) { throw unavailable(); }
        if (result == null || result.isEmpty() || "UNAVAILABLE".equals(result.getFirst())) throw unavailable();
        String state = result.getFirst().toString();
        long position = number(result, 2);
        return new Status(c.getId(), state, result.size() > 1 ? result.get(1).toString() : null,
                position, number(result, 3), number(result, 4), pollAfterSeconds(c, state, position), c.getIdleSeconds());
    }

    /** 실측 부하가 아닌 순번 기반 정책이다. 유휴 만료 전에 최소 세 번 생존 신호를 보낼 여유를 둔다. */
    private static int pollAfterSeconds(AdmissionProperties.Campaign campaign, String state, long position) {
        int interval = 4;
        if ("WAITING".equals(state)) interval = position <= 10 ? 4 : position <= 100 ? 10 : 20;
        return Math.min(interval, campaign.getIdleSeconds() / 3);
    }

    private static long number(List<?> values, int index) { return values.size() > index ? Long.parseLong(values.get(index).toString()) : 0; }
    private static ReservationException unavailable() { return new ReservationException("입장 대기를 잠시 확인할 수 없어요. 순번을 유지한 채 다시 확인해주세요.", HttpStatus.SERVICE_UNAVAILABLE); }
}
