package com.reserve.payment.entity;

import com.reserve.member.entity.Member;
import com.reserve.reservation.entity.Reservation;
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
        PARTIAL_REFUNDED  // 부분 환불
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

    // 환불 처리
    public void refundPayment(Integer refundAmount, String refundReason) {
        this.refundAmount = refundAmount;
        this.refundReason = refundReason;
        this.refundedAt = LocalDateTime.now();
        
        if (refundAmount.equals(this.amount)) {
            this.status = PaymentStatus.REFUNDED;
        } else {
            this.status = PaymentStatus.PARTIAL_REFUNDED;
        }
    }

    // 결제 취소 처리
    public void cancelPayment() {
        this.status = PaymentStatus.CANCELLED;
    }
}
