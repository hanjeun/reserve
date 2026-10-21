package kr.it.reserve.payment.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 환불 시도 원장 — 2026-08-23 신설.
 *
 * <h2>왜 만들었나</h2>
 * 환불이 실패했을 때 추적할 수단이 <b>{@code log.error} 한 줄뿐</b>이었다.
 * 로그는 30일이면 사라지고, 검색은 되지만 <b>"미결 건을 전부 뽑아라"</b>가 안 된다.
 * 실패한 환불은 그대로 잊혀졌고, 손님이 문의해야만 알 수 있었다.
 * 돈이 오가는 경로에서 "무엇을 시도했고 어떻게 끝났는지"는 <b>로그가 아니라 데이터</b>여야 한다.
 *
 * <h2>왜 Payment 에 컬럼을 더 붙이지 않았나</h2>
 * 한 결제에 환불 시도는 <b>여러 번</b> 일어날 수 있다(실패 후 재시도, 부분 환불 두 번).
 * 컬럼으로 붙이면 마지막 시도만 남고 앞의 것이 덮인다 — 그게 정확히 지금 고치고 있는 버그다.
 * 시도마다 한 행을 남겨야 대사(對査)가 된다.
 *
 * <h2>보존 정책</h2>
 * <b>지우지 않는다.</b> {@code AuditLog} 는 90일 뒤 스케줄러가 지우지만 이건 돈 기록이라
 * 남겨둔다. 행 크기가 작고, 이 규모에서 증가 속도는 결제 건수와 같다.
 *
 * <p>기존 테이블·상태·컬럼을 사용한다. 운영 스키마 변경이나 자동 update는 이 구현에 포함되지 않는다.
 */
@Entity
@Table(name = "refund_attempt", indexes = {
        @Index(name = "idx_refund_attempt_payment", columnList = "payment_id"),
        @Index(name = "idx_refund_attempt_status", columnList = "status"),
        @Index(name = "idx_refund_attempt_created", columnList = "created_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefundAttempt {

    /** 기존 REQUESTED와 구분되는, 아직 외부로 발신하지 않은 내구 작업 표식이다. */
    public static final String READY_TO_DISPATCH = "REFUND_READY_TO_DISPATCH";
    private static final String DISPATCH_STARTED = "REFUND_DISPATCH_STARTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "refund_attempt_id")
    private Long id;

    /**
     * 결제 ID를 값으로 보관한다. 원장은 결제의 이후 보정·삭제와 독립적으로 대사할 수 있어야 한다.
     * 기존 값 참조를 유지하며, 새 미발신 의도는 결제 pending과 같은 트랜잭션에 기록한다.
     * 웹훅·재조회의 독립 결말 기록과 충돌할 FK를 이 변경에서 추가하지 않는다.
     */
    @Column(name = "payment_id", nullable = false)
    private Long paymentId;

    /**
     * PG 조회용 주문번호를 <b>값으로도</b> 복사해 둔다.
     * 결제 행이 어떤 이유로 지워져도(가게 삭제 시 {@code deleteByStoreId} 경로가 있다)
     * 원장만으로 PortOne 콘솔에서 대조할 수 있어야 한다.
     */
    @Column(name = "merchant_uid", nullable = false, length = 100)
    private String merchantUid;

    /** 이번 시도에서 요청한 환불 금액. */
    @Column(name = "requested_amount", nullable = false)
    private Integer requestedAmount;

    /** PG 가 실제로 취소했다고 응답한 금액. 요청과 다를 수 있어 따로 남긴다. */
    @Column(name = "cancelled_amount")
    private Integer cancelledAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    /** PortOne 이 부여한 취소 건 ID. 콘솔 대조의 열쇠다. */
    @Column(name = "cancellation_id", length = 100)
    private String cancellationId;

    /** 환불 사유(우리가 보낸 것). */
    @Column(name = "reason", length = 500)
    private String reason;

    /** 실패·미결 원인. 사용자에게 보여주지 않는다. */
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    /** 재조회 횟수. 계속 미결인 건을 사람이 볼 수 있게 하는 신호다. */
    @Column(name = "resolve_attempts", nullable = false)
    private int resolveAttempts;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * "아직 결말이 안 난" 상태 집합. <b>여기 한 곳에서만 정의한다</b> —
     * 스케줄러·관리자 조회·건수 집계가 서로 다른 집합을 쓰면 미결 건이 조용히 새어나간다.
     */
    public static final java.util.Set<Status> UNRESOLVED =
            java.util.Collections.unmodifiableSet(java.util.EnumSet.of(Status.REQUESTED, Status.PENDING));

    public enum Status {
        /** PG 를 부르기 <b>직전</b>에 남긴다. 여기서 응답 없이 끊기면 이 상태로 남아 사람이 확인해야 한다. */
        REQUESTED,
        /** PG 가 접수했지만 결말 미확정({@code REQUESTED}/{@code UNKNOWN}). 스케줄러·웹훅이 해소한다. */
        PENDING,
        /** 돈이 실제로 돌아갔다. */
        SUCCEEDED,
        /** PG가 최종 거절했다. 통신 결과가 불명확한 요청은 PENDING에 남긴다. */
        FAILED
    }

    /**
     * PG 호출 <b>직전</b> 상태의 원장 행을 만든다. 결제를 <b>ID 로만</b> 참조한다 —
     * 미발신 의도에는 {@link #prepare}를 사용한다. 이 팩터리는 과거·합성 원장도 표현한다.
     */
    public static RefundAttempt start(Long paymentId, String merchantUid,
                                      Integer requestedAmount, String reason) {
        RefundAttempt attempt = new RefundAttempt();
        attempt.paymentId = paymentId;
        attempt.merchantUid = merchantUid;
        attempt.requestedAmount = requestedAmount;
        attempt.reason = truncateReason(reason);
        attempt.status = Status.REQUESTED;
        attempt.resolveAttempts = 0;
        return attempt;
    }

    public static RefundAttempt prepare(Long paymentId, String merchantUid,
                                        Integer requestedAmount, String reason) {
        RefundAttempt attempt = start(paymentId, merchantUid, requestedAmount, reason);
        attempt.failureReason = READY_TO_DISPATCH;
        return attempt;
    }

    public boolean isReadyToDispatch() {
        return status == Status.REQUESTED && READY_TO_DISPATCH.equals(failureReason);
    }

    /** 이 변경을 먼저 커밋한 호출자만 PG 취소를 한 번 발신한다. */
    public void markDispatchStarted() {
        if (!isReadyToDispatch()) throw new IllegalStateException("Refund is not ready to dispatch");
        status = Status.PENDING;
        failureReason = DISPATCH_STARTED;
    }

    public void markSucceeded(String cancellationId, Integer cancelledAmount) {
        this.status = Status.SUCCEEDED;
        this.cancellationId = cancellationId;
        this.cancelledAmount = cancelledAmount;
    }

    /** 접수는 됐으나 결말 미확정. {@code note} 에는 UNKNOWN 인지 REQUESTED 인지를 남긴다. */
    public void markPending(String cancellationId, String note) {
        this.status = Status.PENDING;
        this.cancellationId = cancellationId;
        this.failureReason = truncate(note);
    }

    public void markFailed(String failureReason) {
        this.status = Status.FAILED;
        this.failureReason = truncate(failureReason);
    }

    public void markFailed(String cancellationId, String failureReason) {
        this.cancellationId = cancellationId;
        markFailed(failureReason);
    }

    /** 재조회 1회 기록. 결말이 안 나도 시도 횟수는 올라가야 방치된 건이 눈에 띈다. */
    public void recordResolveAttempt() {
        this.resolveAttempts++;
    }

    public boolean isUnresolved() {
        return UNRESOLVED.contains(this.status);
    }

    /** 컬럼 길이(1000)를 넘는 PG 응답이 통째로 들어와 저장이 깨지는 걸 막는다. */
    private static String truncate(String value) {
        if (value == null) return null;
        return value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    /** 사유 컬럼은 500 이다. 원장 저장이 길이 때문에 실패하면 추적 수단 자체가 사라진다. */
    private static String truncateReason(String value) {
        if (value == null) return null;
        return value.length() <= 500 ? value : value.substring(0, 500);
    }
}
