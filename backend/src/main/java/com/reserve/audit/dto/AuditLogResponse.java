package com.reserve.audit.dto;

import com.reserve.audit.entity.AuditLog;
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
        this.snapshot = log.getSnapshot();
        this.reason = log.getReason();
        this.createdAt = log.getCreatedAt();
        this.expiresAt = log.getExpiresAt();
    }

    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(log);
    }
}
