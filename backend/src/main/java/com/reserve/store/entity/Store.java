package com.reserve.store.entity;

import com.reserve.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "store")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "store_id")
    private Long id;

    // 가게 소유자
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private Member owner;

    @Column(name = "store_name", nullable = false)
    private String name;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "address")
    private String address;

    @Column(name = "zip_code", length = 10)
    private String zipCode;

    @Column(name = "address_detail")
    private String addressDetail;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "phone")
    private String phone;

    @Column(name = "category")
    private String category;

    @Column(name = "main_image_url")
    private String mainImageUrl;

    @Column(name = "rating")
    private Double rating;

    @Column(name = "review_count")
    @Builder.Default
    private Integer reviewCount = 0;

    // 키워드 (콤마로 구분된 문자열로 저장)
    @Column(name = "keywords", length = 500)
    private String keywords;

    // 상세 이미지 URL들 (콤마로 구분된 문자열로 저장)
    @Column(name = "detail_images", length = 2000)
    private String detailImages;

    // 영업 시간
    @Column(name = "open_time")
    private LocalTime openTime;

    @Column(name = "close_time")
    private LocalTime closeTime;

    // 브레이크 타임 (선택, null = 없음)
    @Column(name = "break_start_time")
    private LocalTime breakStartTime;

    @Column(name = "break_end_time")
    private LocalTime breakEndTime;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // 노쇼 방지금 (0원이면 무료, null이면 설정 안함)
    @Column(name = "no_show_deposit")
    @Builder.Default
    private Integer noShowDeposit = 0;

    // ========== 환불 정책 ==========
    // 전액 환불 가능 일수 (예약일 N일 전까지 전액 환불)
    @Column(name = "full_refund_days")
    @Builder.Default
    private Integer fullRefundDays = 3;

    // 부분 환불 가능 일수 (예약일 N일 전까지 부분 환불)
    @Column(name = "partial_refund_days")
    @Builder.Default
    private Integer partialRefundDays = 1;

    // 부분 환불 비율 (퍼센트, 예: 50 = 50%)
    @Column(name = "partial_refund_rate")
    @Builder.Default
    private Integer partialRefundRate = 50;

    // ========== 예약 슬롯 정책 ==========
    // 동시간대 최대 예약 인원 (null = 무제한)
    @Column(name = "max_capacity_per_slot")
    private Integer maxCapacityPerSlot;

    // 자동 승인 여부 (true = 예약 즉시 CONFIRMED)
    // NOT NULL + DEFAULT FALSE : JPA 로딩 시에도 null 방지
    @Column(name = "auto_approval_enabled", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean autoApprovalEnabled = false;

    // 예약 가능 마감 시간 (예약 시간 N시간 전까지만 예약 가능, null = 제한 없음)
    @Column(name = "booking_deadline_hours")
    private Integer bookingDeadlineHours;

    // 결제 대기 만료 시간 (예약 생성 후 N분 내 미결제 시 자동 취소, null = 기본값 30분)
    @Column(name = "payment_timeout_minutes")
    @Builder.Default
    private Integer paymentTimeoutMinutes = 30;

    // 예약 단위 시간 (분) - 예약 시간 선택 시 단위, 기본 30분
    @Column(name = "reservation_slot_minutes")
    @Builder.Default
    private Integer reservationSlotMinutes = 30;

    // 나중 결제 허용 여부 (true = 예약금 있어도 즉시 결제 없이 예약 가능, 추후 결제하기 버튼으로 결제)
    @Column(name = "allow_late_payment", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean allowLatePayment = false;

    // 중복 예약 허용 여부 (true = 같은 날짜에 여러 예약 가능, false = 1인 1일 1예약 제한)
    @Column(name = "allow_duplicate_reservation", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean allowDuplicateReservation = false;

    // 이메일 알림 수신 여부 (true = 새 예약 시 사장님에게 이메일 발송)
    @Column(name = "email_notification_enabled", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private Boolean emailNotificationEnabled = true;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    // 키워드 편의 메서드
    public List<String> getKeywordList() {
        if (keywords == null || keywords.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return List.of(keywords.split(","));
    }

    public void setKeywordList(List<String> keywordList) {
        if (keywordList == null || keywordList.isEmpty()) {
            this.keywords = "";
        } else {
            this.keywords = String.join(",", keywordList);
        }
    }

    // 상세 이미지 편의 메서드
    public List<String> getDetailImageList() {
        if (detailImages == null || detailImages.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return List.of(detailImages.split(","));
    }

    public void setDetailImageList(List<String> imageList) {
        if (imageList == null || imageList.isEmpty()) {
            this.detailImages = "";
        } else {
            this.detailImages = String.join(",", imageList);
        }
    }
}
