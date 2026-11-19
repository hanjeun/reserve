package kr.it.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 잔여 인원이 null이면 시간대별 정원 제한이 없다. */
@Getter
@AllArgsConstructor
public class SlotAvailabilityResponse {

    private final String time;
    private final boolean available;
    private final Integer remainingCapacity;

    public SlotAvailabilityResponse(String time, boolean available) {
        this(time, available, null);
    }
}
