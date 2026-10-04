package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Clock;
import java.time.LocalDateTime;

/** 원문 없는 append-only 관리자 열람 원장. 승인한 접근 기록 보존 정책만 파기를 허용한다. */
@Entity
@Table(name = "chat_report_access_audit", indexes = {
        @Index(name = "idx_chat_audit_report_time", columnList = "report_id, accessed_at"),
        @Index(name = "idx_chat_audit_retention", columnList = "accessed_at, id")
})
@Getter
@NoArgsConstructor
public class ChatReportAccessAudit {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "report_id", nullable = false, updatable = false) private Long reportId;
    @Column(name = "admin_member_id", nullable = false, updatable = false) private Long adminMemberId;
    @Column(name = "message_id", updatable = false) private Long messageId;
    @Enumerated(EnumType.STRING) @Column(name = "action", length = 20, nullable = false, updatable = false) private Action action;
    @Column(name = "purpose", length = 40, nullable = false, updatable = false) private String purpose;
    @Column(name = "accessed_at", nullable = false, updatable = false) private LocalDateTime accessedAt;
    public enum Action { CONTEXT, IMAGE, RETENTION_CHANGE }
    public ChatReportAccessAudit(Long reportId, Long adminId, Long messageId, Action action) {
        this.reportId = reportId;
        this.adminMemberId = adminId;
        this.messageId = messageId;
        this.action = action;
        this.purpose = action == Action.RETENTION_CHANGE ? "REPORT_RETENTION" : "REPORT_REVIEW";
        this.accessedAt = LocalDateTime.now(Clock.systemDefaultZone());
    }
}
