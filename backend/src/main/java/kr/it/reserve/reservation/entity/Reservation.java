package kr.it.reserve.reservation.entity;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.store.entity.Store;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
/* 복합 인덱스는 조회 조건·정렬 순서를 기준으로 구성한다. 운영의 구조 변경은 별도 승인된 수동 DDL로 적용한다. */
@Table(name = "reservation", indexes = {
    // findByMemberOrderByCreatedAtDesc — 내 예약 목록. 로그인 사용자가 가장 자주 여는 화면.
    @Index(name = "idx_reservation_auto_completion", columnList = "auto_completion_enabled, status, usage_ends_at"),
    @Index(name = "idx_reservation_member", columnList = "member_id, deleted_at, created_at"),
    // getAvailability 계열 — 예약 가능 시간 계산. 가게 상세에서 날짜를 고를 때마다 돈다.
    @Index(name = "idx_reservation_store_date", columnList = "store_id, reservation_date"),
    // findByStoreOrderByReservationDateDesc… — 사업자 패널 목록
    @Index(name = "idx_reservation_store_date_time", columnList = "store_id, reservation_date, reservation_time"),
    // 관리자 전체 목록 (deletedAt IS NULL ORDER BY createdAt DESC)
    @Index(name = "idx_reservation_deleted_created", columnList = "deleted_at, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "reservation_id")
    private Long id;

    // 표시·대조용 예약 코드이며, 코드가 없는 기존 예약을 보완할 수 있도록 null을 허용한다.
    @Column(name = "reservation_code", length = 20, unique = true)
    private String reservationCode;

    // 예약한 사용자
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    // 예약한 가게
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    @Column(name = "reservation_time", nullable = false)
    private LocalTime reservationTime;

    @Column(name = "guest_count", nullable = false)
    private Integer guestCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private ReservationStatus status = ReservationStatus.PENDING;

    // 요청 사항
    @Column(name = "special_request", length = 500)
    private String specialRequest;
    
    // 거절 사유 (사업자가 예약 거절 시 작성)
    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    /** 가게 취소 사유는 거절 사유와 분리해 저장한다. */
    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    // 결제 정보 (양방향 관계)
    @OneToOne(mappedBy = "reservation", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Payment payment;

    // 노쇼 방지금 결제 여부
    @Column(name = "deposit_paid")
    @Builder.Default
    private Boolean depositPaid = false;

    // 노쇼 방지금 금액
    @Column(name = "deposit_amount")
    @Builder.Default
    private Integer depositAmount = 0;

    @Column(name = "auto_completion_enabled", nullable = false)
    @Builder.Default
    private Boolean autoCompletionEnabled = false;

    @Column(name = "attendance_refund_enabled", nullable = false)
    @Builder.Default
    private Boolean attendanceRefundEnabled = false;

    @Column(name = "service_duration_minutes")
    private Integer serviceDurationMinutes;

    /** 예약 당시 확정한 한국 시간의 이용 종료 시각이에요. */
    @Column(name = "usage_ends_at")
    private LocalDateTime usageEndsAt;

    /** 실제 방문 QR 체크인 시각(KST 벽시계). 승인 상태와 분리해 출석 사실만 기록하며 값이 없으면 미체크인이다. */
    @Column(name = "checked_in_at")
    private LocalDateTime checkedInAt;

    /**
     * 이 예약으로 한 번만 귀속한 배너 광고 ID.
     *
     * <p>광고는 삭제·환불 이력을 독립적으로 보관하므로 관계를 물리지 않고 ID만 남긴다.
     * nullable 신규 컬럼이라 ddl-auto:update 환경에서 기존 예약은 자연스럽게 미귀속 상태로 남는다.
     */
    @Column(name = "attributed_ad_id")
    private Long attributedAdId;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(Clock.systemDefaultZone());
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    public enum ReservationStatus {
        PENDING,    // 대기중 (사용자가 예약 신청)
        CONFIRMED,  // 승인됨 (사업자가 승인)
        COMPLETED,  // 이용완료 (사업자가 이용완료 처리)
        REJECTED,   // 거절됨 (사업자가 거절)
        CANCELLED,  // 취소됨 (사용자 또는 사업자가 취소)
        NO_SHOW,    // 노쇼 (고객이 방문하지 않음)

        /** 승인 뒤 예약 시각만 지난 상태다. 금전이나 방문 여부는 자동 판단하지 않고 사업자의 완료·노쇼 처리를 기다린다. */
        UNCONFIRMED
    }

    public void markDepositPaid(Integer amount) {
        this.depositPaid = true;
        this.depositAmount = amount;
    }
}
