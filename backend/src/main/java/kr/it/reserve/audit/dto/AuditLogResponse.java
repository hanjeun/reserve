package kr.it.reserve.audit.dto;

import kr.it.reserve.audit.entity.AuditLog;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class AuditLogResponse {

    private final Long id;
    private final String entityType;
    private final Long entityId;
    private final String action;
    private final String actorEmail;
    private final String snapshot;
    private final String reason;
    private final LocalDateTime createdAt;
    private final LocalDateTime expiresAt;

    private AuditLogResponse(AuditLog log) {
        this.id = log.getId();
        this.entityType = log.getEntityType();
        this.entityId = log.getEntityId();
        this.action = log.getAction();
        this.actorEmail = log.getActorEmail();
        this.snapshot = reservationSnapshot(log);
        this.reason = log.getReason();
        this.createdAt = log.getCreatedAt();
        this.expiresAt = log.getExpiresAt();
    }

    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(log);
    }

    /** 과거 휴지통 사본이 일반 증거 조회의 개인정보 관문을 우회하지 않게 해요. */
    private static String reservationSnapshot(AuditLog log) {
        if (!"RESERVATION".equalsIgnoreCase(log.getEntityType())) return log.getSnapshot();
        try {
            var json = new com.fasterxml.jackson.databind.ObjectMapper();
            var input = json.readTree(log.getSnapshot());
            var safe = json.createObjectNode();
            for (String key : java.util.List.of("가게", "예약번호", "날짜", "상태", "목적")) {
                if (input.has(key) && input.get(key).isTextual()) safe.put(key, input.get(key).asText());
            }
            return json.writeValueAsString(safe);
        } catch (Exception ignored) { return "{}"; }
    }
}
