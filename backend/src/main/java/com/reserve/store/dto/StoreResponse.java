package com.reserve.store.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.reserve.store.entity.Store;
import jakarta.validation.constraints.Min;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoreResponse {
    
    private Long id;
    private String name;
    private String description;
    private String address;
    private String zipCode;
    private String addressDetail;
    private Double latitude;
    private Double longitude;
    private String phone;
    private String category;
    private String mainImageUrl;
    private List<String> detailImageUrls;
    private List<String> keywords;
    
    @JsonFormat(pattern = "HH:mm")
    private LocalTime openTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime closeTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime breakStartTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime breakEndTime;
    
    private Double rating;
    private Integer reviewCount;

    @Min(value = 0, message = "노쇼 금액은 0원 이상이어야 합니다.")
    private Integer noShowDeposit;  // 노쇼 방지금
    
    // ========== 환불 정책 ==========
    private Integer fullRefundDays;     // 전액 환불 가능 일수
    private Integer partialRefundDays;  // 부분 환불 가능 일수
    private Integer partialRefundRate;  // 부분 환불 비율 (%)

    // 예약 슬롯 정책
    private Integer maxCapacityPerSlot;
    private Boolean autoApprovalEnabled;
    private Integer bookingDeadlineHours;
    private Integer paymentTimeoutMinutes;
    private Integer reservationSlotMinutes;
    private Boolean allowLatePayment;
    private Boolean allowDuplicateReservation;
    private Boolean emailNotificationEnabled;

    private LocalDateTime createdAt;
    private Long ownerId;  // 소유자 ID (프론트 권한 검증용)

    // ── 제재 상태 (관리자 목록/소유자 화면용) ──
    private String status;            // ACTIVE | SUSPENDED | BANNED
    private String suspendedUntil;    // SUSPENDED일 때만 값 존재, BANNED/ACTIVE는 null
    private String suspendReason;

    public static StoreResponse fromEntity(Store store) {
        return StoreResponse.builder()
                .id(store.getId())
                .name(store.getName())
                .description(store.getDescription())
                .address(store.getAddress())
                .zipCode(store.getZipCode())
                .addressDetail(store.getAddressDetail())
                .latitude(store.getLatitude())
                .longitude(store.getLongitude())
                .phone(store.getPhone())
                .category(store.getCategory())
                .mainImageUrl(store.getMainImageUrl())
                .detailImageUrls(store.getDetailImageList())
                .keywords(store.getKeywordList())
                .openTime(store.getOpenTime())
                .closeTime(store.getCloseTime())
                .breakStartTime(store.getBreakStartTime())
                .breakEndTime(store.getBreakEndTime())
                .rating(store.getRating())
                .reviewCount(store.getReviewCount())
                .noShowDeposit(store.getNoShowDeposit())
                .fullRefundDays(store.getFullRefundDays())
                .partialRefundDays(store.getPartialRefundDays())
                .partialRefundRate(store.getPartialRefundRate())
                .maxCapacityPerSlot(store.getMaxCapacityPerSlot())
                .autoApprovalEnabled(store.getAutoApprovalEnabled())
                .bookingDeadlineHours(store.getBookingDeadlineHours())
                .paymentTimeoutMinutes(store.getPaymentTimeoutMinutes())
                .reservationSlotMinutes(store.getReservationSlotMinutes())
                .allowLatePayment(store.getAllowLatePayment())
                .allowDuplicateReservation(store.getAllowDuplicateReservation())
                .emailNotificationEnabled(store.getEmailNotificationEnabled())
                .createdAt(store.getCreatedAt())
                .ownerId(store.getOwner() != null ? store.getOwner().getId() : null)
                .status(store.getStatus() != null ? store.getStatus().name() : "ACTIVE")
                .suspendedUntil(store.getSuspendedUntil() != null ? store.getSuspendedUntil().toLocalDate().toString() : null)
                .suspendReason(store.getSuspendReason())
                .build();
    }
}
