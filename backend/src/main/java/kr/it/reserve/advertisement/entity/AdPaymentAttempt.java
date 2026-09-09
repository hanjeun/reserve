package kr.it.reserve.advertisement.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

/** 광고의 결제 시도 원장. 식별자·소유자·금액은 생성 뒤 바꾸거나 삭제하지 않는다. */
@Entity
@Table(name = "ad_payment_attempt", indexes = {
        @Index(name = "idx_ad_payment_due", columnList = "next_check_at, id"),
        @Index(name = "idx_ad_payment_store", columnList = "store_id, state"),
        @Index(name = "idx_ad_payment_owner", columnList = "owner_id, state"),
        @Index(name = "idx_ad_payment_ad", columnList = "ad_id, id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdPaymentAttempt {
    public enum State { READY, PAID, FAILED, REFUND_PENDING, REFUNDED, REVIEW_REQUIRED }
    public static final Set<State> UNRESOLVED = Set.of(State.READY, State.REFUND_PENDING, State.REVIEW_REQUIRED);

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    // 원장 보존을 위해 엔티티 연관/연쇄 삭제 대신 불변 식별자를 저장한다.
    @Column(nullable = false, updatable = false) private Long adId;
    @Column(nullable = false, updatable = false) private Long storeId;
    @Column(nullable = false, updatable = false) private Long ownerId;
    @Column(nullable = false, updatable = false, unique = true, length = 255) private String merchantUid;
    @Column(nullable = false, updatable = false) private Integer amount;
    @Column(nullable = false, updatable = false) private boolean legacy;
    @Column(updatable = false, length = 32) private String legacyStatus;
    @Column(nullable = false, updatable = false) private LocalDateTime createdAt;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(32)") private State state;
    @Column(length = 64) private String issueCode;
    @Column(length = 32) private String pgStatus;
    private Long cancelledAmount;
    @Column(nullable = false) private boolean everPaid;
    @Column(nullable = false) private boolean cancelRequested;
    private Long cancelRequestedBy;
    @Column(length = 64) private String refundKey;
    private LocalDateTime refundDispatchedAt;
    private LocalDateTime refundConfirmedAt;
    @Column(length = 255) private String cancellationId;
    private LocalDateTime lastCheckedAt;
    private LocalDateTime nextCheckAt;
    @Column(nullable = false) private int checkCount;
    @Column(length = 36) private String leaseToken;
    private LocalDateTime leaseUntil;

    public static AdPaymentAttempt create(Advertisement ad, boolean legacy) {
        AdPaymentAttempt attempt = new AdPaymentAttempt();
        attempt.adId = ad.getId();
        attempt.storeId = ad.getStore().getId();
        attempt.ownerId = ad.getStore().getOwner().getId();
        attempt.merchantUid = ad.getMerchantUid();
        attempt.amount = ad.getAmount();
        attempt.legacy = legacy;
        attempt.legacyStatus = legacy ? ad.getStatus().name() : null;
        attempt.createdAt = LocalDateTime.now();
        attempt.state = legacy ? State.REVIEW_REQUIRED : State.READY;
        attempt.issueCode = legacy ? "LEGACY_RECHECK_REQUIRED" : null;
        attempt.nextCheckAt = attempt.createdAt.plusMinutes(5);
        return attempt;
    }

    /** lease를 잡은 짧은 트랜잭션이 커밋된 뒤에만 외부 통신한다. */
    public String claim(LocalDateTime now) {
        if (leaseUntil != null && leaseUntil.isAfter(now)) return null;
        leaseToken = UUID.randomUUID().toString();
        leaseUntil = now.plusMinutes(5);
        if (checkCount < Integer.MAX_VALUE) checkCount++;
        nextCheckAt = now.plusMinutes(Math.min(60, 5L * Math.max(1, checkCount)));
        return leaseToken;
    }

    public boolean ownsLease(String token) { return token != null && token.equals(leaseToken); }

    public void release() { leaseToken = null; leaseUntil = null; }

    public void observed(String status, Long cancelled, LocalDateTime now) {
        pgStatus = status;
        cancelledAmount = cancelled;
        lastCheckedAt = now;
        if ("PAID".equals(status) || "PARTIAL_CANCELLED".equals(status) || "CANCELLED".equals(status)) everPaid = true;
    }

    public void reviewed(State newState, String issue) {
        state = newState;
        issueCode = issue;
        if (newState == State.PAID || newState == State.REFUNDED) everPaid = true;
        if (newState == State.REFUNDED && refundConfirmedAt == null) refundConfirmedAt = LocalDateTime.now();
        if (!UNRESOLVED.contains(newState)) nextCheckAt = null;
    }

    public void requireReview(String code) {
        reviewed(refundDispatchedAt == null ? State.REVIEW_REQUIRED : State.REFUND_PENDING, code);
        nextCheckAt = LocalDateTime.now().plusMinutes(5);
    }

    public void requestCancel(Long actorId) {
        cancelRequested = true;
        if (cancelRequestedBy == null) cancelRequestedBy = actorId;
        if (state != State.REFUNDED && state != State.FAILED) {
            requireReview("CANCELLATION_RECHECK_REQUIRED");
        }
    }

    /** 발신 의도를 반드시 먼저 커밋한다. 응답을 잃어도 새 키로 무조건 다시 환불하지 않는다. */
    public boolean dispatchRefund(LocalDateTime now) {
        if (refundDispatchedAt != null || refundConfirmedAt != null || "REFUNDED".equals(legacyStatus)) return false;
        if (refundKey == null) refundKey = "ad-refund-" + UUID.randomUUID();
        refundDispatchedAt = now;
        reviewed(State.REFUND_PENDING, "REFUND_DISPATCHED");
        nextCheckAt = now.plusMinutes(5);
        return true;
    }

    public void cancellationObserved(String cancellationId) { this.cancellationId = cancellationId; }
}
