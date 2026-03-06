package com.reserve.store.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class StoreUpdateRequest {
    
    private String name;
    private String description;
    private String address;
    private String phone;
    private String category;
    
    // 키워드 (콤마 구분 문자열 또는 리스트)
    private List<String> keywords;
    
    // 새 이미지 업로드 (선택적)
    private MultipartFile mainImage;
    private List<MultipartFile> detailImages;

    // 기존 이미지 URL 유지
    private String existingMainImageUrl;
    private List<String> existingDetailImageUrls;

    // 영업 시간
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime openTime;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime closeTime;

    // 노쇼 방지금 (0원이면 무료)
    private Integer noShowDeposit;

    // ========== 환불 정책 ==========
    // 전액 환불 가능 일수 (예약일 N일 전까지 전액 환불)
    private Integer fullRefundDays;

    // 부분 환불 가능 일수 (예약일 N일 전까지 부분 환불)
    private Integer partialRefundDays;

    // 부분 환불 비율 (퍼센트, 예: 50 = 50%)
    private Integer partialRefundRate;

    // ========== 예약 슬롯 정책 ==========
    // 빈 문자열("") 허용 : 빈 문자열 = 무제한(null), 숫자 = 제한 인원
    private String maxCapacityPerSlotRaw;
    private Boolean autoApprovalEnabled;

    // 예약 가능 마감 시간
    private Integer bookingDeadlineHours;

    // 결제 대기 만료 시간
    private Integer paymentTimeoutMinutes;

    // 예약 단위 시간 (분)
    private Integer reservationSlotMinutes;

    // 나중 결제 허용
    private Boolean allowLatePayment;

    // 중복 예약 허용 (null = 변경 없음)
    private Boolean allowDuplicateReservation;

    public Integer getMaxCapacityPerSlot() {
        if (maxCapacityPerSlotRaw == null || maxCapacityPerSlotRaw.isBlank()) return null;
        try { return Integer.parseInt(maxCapacityPerSlotRaw.trim()); }
        catch (NumberFormatException e) { return null; }
    }

    // 폼 파라미터 이름 매핑 (백엔드는 maxCapacityPerSlot 로도 받음)
    public void setMaxCapacityPerSlot(String value) {
        this.maxCapacityPerSlotRaw = value;
    }
}
