package com.reserve.store.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class StoreCreateRequest {
    
    private String name;
    private String description;
    private String address;
    private String phone;
    private String category;
    
    // 키워드 리스트
    private List<String> keywords = new ArrayList<>();
    
    // 영업 시간 - 초(ss) 없이 "HH:mm" 형식으로 받기
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime openTime;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime closeTime;

    // 브레이크 타임 (선택, null = 없음)
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime breakStartTime;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime breakEndTime;

    // 메인 이미지 파일
    private MultipartFile mainImage;
    
    // 상세 이미지 파일들
    private List<MultipartFile> detailImages = new ArrayList<>();
    
    // 노쇼 방지금 (0원이면 무료)
    private Integer noShowDeposit = 0;
    
    // ========== 환불 정책 ==========
    // 전액 환불 가능 일수 (예약일 N일 전까지 전액 환불)
    private Integer fullRefundDays = 3;
    
    // 부분 환불 가능 일수 (예약일 N일 전까지 부분 환불)
    private Integer partialRefundDays = 1;
    
    // 부분 환불 비율 (퍼센트, 예: 50 = 50%)
    private Integer partialRefundRate = 50;

    // ========== 예약 슬롯 정책 ==========
    // 빈 문자열("") 허용: 빈 문자열 = 무제한(null), 숫자 = 제한 인원
    private String maxCapacityPerSlotRaw;

    // 자동 승인 여부 (기본 false)
    private Boolean autoApprovalEnabled = false;

    // 예약 가능 마감 시간
    private Integer bookingDeadlineHours;

    // 결제 대기 만료 시간 (기본 30분)
    private Integer paymentTimeoutMinutes = 30;

    // 예약 단위 시간 (분, 기본 30분)
    private Integer reservationSlotMinutes = 30;

    // 나중 결제 허용 (기본 false)
    private Boolean allowLatePayment = false;

    // 중복 예약 허용 (기본 false - 1인 1일 1예약 제한)
    private Boolean allowDuplicateReservation = false;

    // 이메일 알림 수신 여부 (기본 true)
    private Boolean emailNotificationEnabled = true;

    public Integer getMaxCapacityPerSlot() {
        if (maxCapacityPerSlotRaw == null || maxCapacityPerSlotRaw.isBlank()) return null;
        try { return Integer.parseInt(maxCapacityPerSlotRaw.trim()); }
        catch (NumberFormatException e) { return null; }
    }

    public void setMaxCapacityPerSlot(String value) {
        this.maxCapacityPerSlotRaw = value;
    }
}
