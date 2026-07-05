package com.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 날짜별 예약 슬롯 가용 여부 응답 (예약 시간 선택 UI용)
 */
@Getter
@AllArgsConstructor
public class SlotAvailabilityResponse {

    private String time;       // "09:00" 형식
    private boolean available; // 정원 여유 있는지
}
