package kr.it.reserve.reservation.entity;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.store.entity.Store;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
/*
 * 인덱스는 ReservationRepository의 실제 쿼리에서 역산했다(추측으로 넣지 않았다).
 * ddl-auto: update 라 재시작 시 자동 생성된다. 단 **삭제·변경은 자동 반영되지 않으므로**
 * 여기서 이름을 바꾸면 옛 인덱스가 DB에 그대로 남는다 — 수동 DROP이 필요하다.
 *
 * 복합 인덱스는 왼쪽부터 쓰이므로 (등호 조건 → 정렬) 순서로 놓는다.
 */
@Table(name = "reservation", indexes = {
    // findByMemberOrderByCreatedAtDesc — 내 예약 목록. 로그인 사용자가 가장 자주 여는 화면.
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

    // 표시용 예약번호 (R-YYYYMMDD-XXXX) — auto-increment id 노출 대신 사람이 읽고 대조하는 용도.
    // ddl-auto: update 환경이라 기존 행 백필을 위해 nullable로 둔다(ReservationCodeBackfillRunner가 1회 채움).
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

    // 예약 날짜
    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    // 예약 시간
    @Column(name = "reservation_time", nullable = false)
    private LocalTime reservationTime;

    // 예약 인원
    @Column(name = "guest_count", nullable = false)
    private Integer guestCount;

    // 예약 상태
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

    /**
     * 가게가 취소한 사유 (2026-08-11 추가).
     *
     * <p>{@code rejectionReason} 을 재사용하지 않은 이유 — 화면이 그 값을 <b>"거절 사유"</b> 라는
     * 라벨로 보여준다. 취소된 예약에 "거절 사유"가 뜨면 이용자가 무슨 일이 있었는지 오해한다.
     * {@code ddl-auto: update} 라 컬럼 추가는 재시작 시 자동 반영된다(삭제·타입변경만 수동 DDL).
     */
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

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
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
        NO_SHOW     // 노쇼 (고객이 방문하지 않음)
    }

    // 결제 완료 처리
    public void markDepositPaid(Integer amount) {
        this.depositPaid = true;
        this.depositAmount = amount;
    }
}
