package com.reserve.audit.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * 감사 로그 — 관리자/시스템 행위 추적
 *
 * 용도:
 * - 소프트 삭제 시 스냅샷 보존 (복구용)
 * - 관리자 행위 추적 (메일 삭제, 가게 승인 등)
 * - 90일 후 자동 삭제 (스케줄러)
 */
@Entity
@Table(name = "audit_log", indexes = {
    @Index(name = "idx_audit_entity", columnList = "entityType, entityId"),
    @Index(name = "idx_audit_expires", columnList = "expiresAt")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String entityType;  // MAIL, STORE, MEMBER, RESERVATION, REVIEW

    @Column(nullable = false)
    private Long entityId;

    @Column(nullable = false, length = 20)
    private String action;  // SOFT_DELETE, RESTORE, HARD_DELETE

    @Column(length = 255)
    private String actorEmail;  // 관리자 이메일

    @Column(columnDefinition = "JSON")
    private String snapshot;  // 핵심 필드 JSON 스냅샷

    @Column(length = 500)
    private String reason;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime expiresAt;  // 이 날짜 이후 스케줄러가 삭제

    @Builder
    public AuditLog(String entityType, Long entityId, String action,
                    String actorEmail, String snapshot, String reason,
                    LocalDateTime expiresAt) {
        this.entityType = entityType;
        this.entityId = entityId;
        this.action = action;
        this.actorEmail = actorEmail;
        this.snapshot = snapshot;
        this.reason = reason;
        this.expiresAt = expiresAt;
    }
}
