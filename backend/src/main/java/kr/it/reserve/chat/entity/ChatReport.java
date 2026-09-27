package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 사용자가 제출한 채팅 신고. 신고 내용은 수정하지 않고 관리자 처리 상태만 전이한다. */
@Entity
@Table(
        name = "chat_report",
        uniqueConstraints = @UniqueConstraint(name = "uk_chat_report_key", columnNames = "report_key"),
        indexes = {
                @Index(name = "idx_chat_report_status_created", columnList = "status, created_at"),
                @Index(name = "idx_chat_report_room", columnList = "room_id, created_at")
        }
)
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoom room;

    @Column(name = "message_id")
    private Long messageId;

    @Column(name = "reporter_member_id", nullable = false)
    private Long reporterMemberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reporter_role", length = 10, nullable = false)
    private SenderRole reporterRole;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", length = 30, nullable = false)
    private Reason reason;

    @Column(name = "details", length = 500)
    private String details;

    /** 같은 참가자가 같은 메시지/대화를 반복 제출해 행을 늘리지 못하게 하는 안정 키. */
    @Column(name = "report_key", length = 128, nullable = false, updatable = false)
    private String reportKey;

    /** null인 이전 신고는 증거 backfill 전 원문 파기를 보류한다. 빈 스냅샷과 구분한다. */
    @Column(name = "evidence_captured_at", updatable = false)
    private LocalDateTime evidenceCapturedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    @Builder.Default
    private Status status = Status.OPEN;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    @Column(name = "reviewed_by_member_id")
    private Long reviewedByMemberId;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public void review(Status nextStatus, String note, Long adminId, LocalDateTime at) {
        this.status = nextStatus;
        this.resolutionNote = note;
        this.reviewedByMemberId = adminId;
        this.reviewedAt = at;
    }

    public enum Reason {
        SPAM,
        HARASSMENT,
        INAPPROPRIATE,
        FRAUD,
        OTHER
    }

    public enum Status {
        OPEN,
        REVIEWING,
        RESOLVED,
        DISMISSED
    }
}
