package kr.it.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 날짜별 예약 가능 상태와 사유를 서버 판정으로 전달한다.
 * 프론트는 상태를 표시하고 가게 예약 규칙을 별도로 재계산하지 않는다.
 * openSlots는 잔여 인원이 아닌 지금 고를 수 있는 시각 수다.
 * SLOT은 시간대, SESSION은 회차, DAY는 0 또는 1로 표현하며 정원은 각 슬롯에 적용한다.
 */
@Getter
@AllArgsConstructor
public class CalendarDayResponse {

    /** 시간대 변환 없이 비교하도록 ISO 날짜 문자열을 사용한다. */
    private String date;

    /** {@link DayStatus} 이름. */
    private String status;

    /** 그 날 구조적으로 존재하는 예약 시각 수(정원·현재시각 반영 전). {@code CLOSED} 등이면 0. */
    private int totalSlots;

    /** 지금 실제로 고를 수 있는 시각 수. {@code 0} 이면 {@code FULL} 이거나 예약 불가 상태다. */
    private int openSlots;

    /** 공휴일 표시는 예약 가능 상태와 독립이다. 조회할 수 없을 때도 예약 판정에는 영향을 주지 않는다. */
    private boolean holiday;

    /**
     * 막힌 이유. <b>판정 순서는 {@code ReservationService.validateReservationSlot} 과 같다</b> —
     * 달력이 말하는 이유와 예약 실패 메시지가 서로 달라지면 안 된다.
     */
    public enum DayStatus {
        /** 지난 날짜. */
        PAST,
        /** 정기 휴무 또는 임시 휴무. */
        CLOSED,
        /** 운영 기간(openDate~closeDate) 밖. 팝업스토어·시즌 영업. */
        OUT_OF_PERIOD,
        /** {@code maxAdvanceBookingDays} 를 넘는 먼 미래. */
        TOO_FAR,
        /** 열려 있지만 고를 수 있는 시각이 없다 — 정원이 다 찼거나 마감 시간이 지났다. */
        FULL,
        /** 예약할 수 있다. */
        OPEN
    }
}
