package kr.it.reserve.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 자동으로 단정하면 위험한 결제 상태를 운영자가 대사할 수 있게 남기는 현재 작업 큐.
 *
 * <p>구매자 이름·이메일·전화번호와 PG 원문은 저장하지 않는다. PortOne 콘솔 대조에 필요한
 * 내부 payment/reservation ID와 merchantUid, 기계적인 원인 코드만 둔다.
 * payment FK를 걸지 않는 이유는 결제 행을 잠근 트랜잭션에서 이 행을 REQUIRES_NEW로 남길 때
 * 부모 FK 잠금과 교착하지 않게 하기 위해서다.
 */
@Entity
@Table(
        name = "payment_reconciliation_issue",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_payment_reconciliation_issue_key",
                columnNames = "issue_key"),
        indexes = {
                @Index(name = "idx_payment_reconciliation_issue_status", columnList = "status,last_seen_at"),
                @Index(name = "idx_payment_reconciliation_issue_payment", columnList = "payment_id"),
                @Index(name = "idx_payment_reconciliation_issue_reservation", columnList = "reservation_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentReconciliationIssue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "payment_reconciliation_issue_id")
    private Long id;

    @Column(name = "issue_key", nullable = false, length = 160)
    private String issueKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "issue_type", nullable = false, length = 40)
    private IssueType issueType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private IssueStatus status;

    @Column(name = "payment_id")
    private Long paymentId;

    @Column(name = "reservation_id")
    private Long reservationId;

    @Column(name = "merchant_uid", length = 100)
    private String merchantUid;

    @Column(name = "detail_code", length = 120)
    private String detailCode;

    @Column(name = "occurrence_count", nullable = false)
    private int occurrenceCount;

    @Column(name = "first_seen_at", nullable = false, updatable = false)
    private LocalDateTime firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    public static PaymentReconciliationIssue open(
            String issueKey,
            IssueType issueType,
            Long paymentId,
            Long reservationId,
            String merchantUid,
            String detailCode,
            LocalDateTime now) {
        PaymentReconciliationIssue issue = new PaymentReconciliationIssue();
        issue.issueKey = truncate(issueKey, 160);
        issue.issueType = issueType;
        issue.status = IssueStatus.OPEN;
        issue.paymentId = paymentId;
        issue.reservationId = reservationId;
        issue.merchantUid = truncate(merchantUid, 100);
        issue.detailCode = truncate(detailCode, 120);
        issue.occurrenceCount = 1;
        issue.firstSeenAt = now;
        issue.lastSeenAt = now;
        return issue;
    }

    public void touch(IssueType issueType, String detailCode, LocalDateTime now) {
        this.issueType = issueType;
        this.detailCode = truncate(detailCode, 120);
        this.status = IssueStatus.OPEN;
        this.resolvedAt = null;
        this.lastSeenAt = now;
        this.occurrenceCount++;
    }

    public void resolve(LocalDateTime now) {
        if (status == IssueStatus.RESOLVED) {
            return;
        }
        status = IssueStatus.RESOLVED;
        resolvedAt = now;
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public enum IssueType {
        EXPIRY_RECHECK_FAILED,
        EXPIRY_STATUS_UNCERTAIN,
        LOCAL_STATUS_UNCERTAIN,
        STALE_READY_RECHECK_FAILED,
        STALE_READY_STILL_PENDING,
        STALE_READY_STATUS_UNCERTAIN,
        LATE_PAID_RESERVATION,
        PAID_STATE_CONFLICT,
        PAID_AMOUNT_MISMATCH,
        REFUND_LEDGER_MISSING
    }

    public enum IssueStatus {
        OPEN,
        RESOLVED
    }
}
