package kr.it.reserve.payment.entity;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "payment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "payment_id")
    private Long id;

    // 결제한 회원
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    // 연결된 예약
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reservation_id", nullable = false)
    private Reservation reservation;

    // 포트원 고유 결제번호 (imp_uid)
    @Column(name = "imp_uid", unique = true)
    private String impUid;

    // 가맹점 주문번호 (merchant_uid)
    @Column(name = "merchant_uid", nullable = false, unique = true)
    private String merchantUid;

    // 결제 금액
    @Column(name = "amount", nullable = false)
    private Integer amount;

    // 결제 수단 (kakaopay, naverpay 등)
    @Column(name = "pay_method", length = 50)
    private String payMethod;

    // PG사
    @Column(name = "pg_provider", length = 50)
    private String pgProvider;

    // 결제 상태
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.READY;

    // 결제 상품명
    @Column(name = "product_name")
    private String productName;

    // 구매자 이름
    @Column(name = "buyer_name")
    private String buyerName;

    // 구매자 이메일
    @Column(name = "buyer_email")
    private String buyerEmail;

    // 구매자 전화번호
    @Column(name = "buyer_tel")
    private String buyerTel;

    // 환불 금액 (부분 환불 시)
    @Column(name = "refund_amount")
    @Builder.Default
    private Integer refundAmount = 0;

    // 환불 사유
    @Column(name = "refund_reason", length = 500)
    private String refundReason;

    // 결제 완료 시간
    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    // 환불 완료 시간
    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;

    // 실패 사유
    @Column(name = "fail_reason", length = 500)
    private String failReason;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum PaymentStatus {
        READY,      // 결제 준비
        PAID,       // 결제 완료
        CANCELLED,  // 결제 취소
        FAILED,     // 결제 실패
        REFUNDED,   // 환불 완료
        PARTIAL_REFUNDED,  // 부분 환불
        /**
         * 환불을 PG 에 접수했지만 <b>아직 돈이 돌아갔는지 모르는</b> 상태 — 2026-08-23 신설.
         *
         * <p>PortOne V2 취소는 200 과 함께 {@code REQUESTED}(접수됨)를 돌려줄 수 있다.
         * 그걸 REFUNDED 로 적으면 "장부는 환불, 실제로는 미환불"이라는 가장 나쁜 어긋남이 생긴다.
         * 결말은 웹훅이나 재조회 스케줄러가 확인해 REFUNDED 또는 PAID(실패 시 원복)로 옮긴다.
         *
         * <p>이 상태에서는 <b>추가 환불을 받지 않는다</b> — 결말을 모르는 채로 또 취소를 걸면
         * 이중 환불이 된다.
         */
        REFUND_PENDING
    }

    // 결제 완료 처리
    public void completePayment(String impUid, String payMethod, String pgProvider) {
        this.impUid = impUid;
        this.payMethod = payMethod;
        this.pgProvider = pgProvider;
        this.status = PaymentStatus.PAID;
        this.paidAt = LocalDateTime.now();
    }

    // 결제 실패 처리
    public void failPayment(String failReason) {
        this.status = PaymentStatus.FAILED;
        this.failReason = failReason;
    }

    /**
     * 이미 환불된 금액. {@code null} 을 0 으로 정규화해 호출측이 매번 확인하지 않게 한다.
     * (컬럼이 나중에 추가돼 옛 행에는 {@code NULL} 이 들어 있을 수 있다.)
     */
    public int refundedSoFar() {
        return this.refundAmount == null ? 0 : this.refundAmount;
    }

    /** 아직 환불할 수 있는 잔액. 음수가 될 수 없다. */
    public int remainingRefundable() {
        return Math.max(0, (this.amount == null ? 0 : this.amount) - refundedSoFar());
    }

    /**
     * 환불 확정 처리 — <b>PG 가 실제로 취소를 완료했을 때만</b> 부른다.
     *
     * <p>★ 2026-08-23 두 가지를 고쳤다.
     * <ol>
     *   <li><b>대입 → 누적.</b> 예전엔 {@code this.refundAmount = refundAmount} 였다.
     *       부분 환불이 두 번 일어나면 <b>앞의 금액이 지워져</b> 얼마를 돌려줬는지 장부에서 사라졌다.
     *       "3만원 환불 두 번"이 "3만원 환불"로 보이는 셈이라, 대사(對査)가 불가능했다.</li>
     *   <li><b>완료 판정을 {@code equals} → 누적액 비교로.</b> 예전엔 이번 회차 금액이
     *       결제액과 정확히 같을 때만 REFUNDED 였다. 5만원을 2만+3만으로 나눠 돌려주면
     *       전액을 돌려주고도 영원히 PARTIAL_REFUNDED 로 남았다.</li>
     * </ol>
     *
     * <p><b>이 메서드는 동시 호출을 막지 못한다.</b> 두 요청이 같은 결제를 동시에 읽으면
     * 둘 다 PG 취소를 부른 뒤 여기 도착한다 — 진짜 방어선은 호출측의 행 잠금이다
     * ({@code PaymentRepository#findByIdForUpdate}). 여기 누적은 그게 뚫렸을 때
     * <b>피해를 기록으로라도 남기기 위한</b> 2차 방어다.
     */
    public void refundPayment(Integer refundAmount, String refundReason) {
        int added = refundAmount == null ? 0 : refundAmount;
        this.refundAmount = refundedSoFar() + added;
        this.refundReason = refundReason;
        this.refundedAt = LocalDateTime.now();

        if (this.amount != null && this.refundAmount >= this.amount) {
            this.status = PaymentStatus.REFUNDED;
        } else {
            this.status = PaymentStatus.PARTIAL_REFUNDED;
        }
    }

    /**
     * PG 가 취소를 <b>접수만</b> 한 상태로 표시한다(2026-08-23 신설).
     * 금액은 아직 더하지 않는다 — 확정되지 않은 돈을 장부에 올리면 안 된다.
     */
    public void markRefundPending(String refundReason) {
        this.status = PaymentStatus.REFUND_PENDING;
        this.refundReason = refundReason;
    }

    /**
     * 접수됐던 환불이 최종 실패로 판명됐을 때 되돌린다.
     * 돈이 안 나갔으므로 결제는 다시 PAID 다 — 손님이 재시도할 수 있어야 한다.
     */
    public void revertRefundPending(String failReason) {
        if (this.status == PaymentStatus.REFUND_PENDING) {
            this.status = refundedSoFar() > 0 ? PaymentStatus.PARTIAL_REFUNDED : PaymentStatus.PAID;
            this.failReason = failReason;
        }
    }

    // 결제 취소 처리
    public void cancelPayment() {
        this.status = PaymentStatus.CANCELLED;
    }
}
