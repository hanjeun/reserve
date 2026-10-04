package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
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
                @Index(name = "idx_chat_report_room", columnList = "room_id, created_at"),
                @Index(name = "idx_chat_report_retention", columnList = "retention_category, retention_hold, status, reviewed_at, id"),
                @Index(name = "idx_chat_report_contract_retention", columnList = "retention_category, retention_hold, status, retention_basis_at, id")
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

    /** 이전 신고는 명시적으로 분류하기 전까지 파기하지 않는다. */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "retention_category", length = 30, nullable = false)
    @Builder.Default
    private RetentionCategory retentionCategory = RetentionCategory.UNCLASSIFIED;

    @Column(name = "retention_hold", nullable = false)
    private boolean retentionHold;

    /** 계약·결제·공급 기록의 실제 기산일. UTC 저장, 관리 API는 offset 있는 값을 받는다. */
    @Column(name = "retention_basis_at")
    private LocalDateTime retentionBasisAt;

    /** 이미 확정한 법정 보존 하한은 이후 분류 정정으로 앞당기지 않는다. */
    @Column(name = "minimum_retention_until")
    private LocalDateTime minimumRetentionUntil;

    @Column(name = "retention_note", length = 500)
    private String retentionNote;

    @Column(name = "retention_changed_by_member_id")
    private Long retentionChangedByMemberId;

    @Column(name = "retention_changed_at")
    private LocalDateTime retentionChangedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public void review(Status nextStatus, String note, Long adminId, LocalDateTime at) {
        this.status = nextStatus;
        this.resolutionNote = note;
        this.reviewedByMemberId = adminId;
        this.reviewedAt = at;
        extendStatutoryMinimum();
    }

    public void changeRetention(RetentionCategory category, boolean hold, LocalDateTime basisAt,
                                String note, Long adminId, LocalDateTime at) {
        this.retentionCategory = category;
        this.retentionHold = hold;
        this.retentionBasisAt = basisAt;
        this.retentionNote = note;
        this.retentionChangedByMemberId = adminId;
        this.retentionChangedAt = at;
        extendStatutoryMinimum();
    }

    public boolean isTerminal() {
        return status == Status.RESOLVED || status == Status.DISMISSED;
    }

    private void extendStatutoryMinimum() {
        LocalDateTime until = null;
        if (retentionCategory == RetentionCategory.CONSUMER_DISPUTE && isTerminal() && reviewedAt != null) {
            until = reviewedAt.plusYears(3);
        } else if (retentionCategory == RetentionCategory.CONTRACT_PAYMENT && retentionBasisAt != null) {
            // 날짜만 지정한 계약 기록도 그날 늦게 발생한 거래의 5년을 모두 보장한다.
            until = retentionBasisAt.plusYears(5).plusDays(1);
        }
        if (until != null && (minimumRetentionUntil == null || until.isAfter(minimumRetentionUntil))) {
            minimumRetentionUntil = until;
        }
    }

    public enum RetentionCategory {
        UNCLASSIFIED,
        GENERAL_REPORT,
        CONSUMER_DISPUTE,
        CONTRACT_PAYMENT
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
