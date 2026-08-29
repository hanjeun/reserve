package kr.it.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 달력 한 칸 — <b>그 날짜가 어떤 상태인지, 그리고 왜 그런지.</b>
 *
 * <h2>왜 boolean 이 아니라 사유(status)인가 (2026-08-25)</h2>
 * 지금 손님 화면의 날짜 칸은 AntD {@code DatePicker} 의 {@code disabledDate} 다.
 * 그건 <b>회색으로 막는 것밖에 못 한다</b> — 정기 휴무, 임시 휴무, 운영기간 밖,
 * 예약 가능 범위 초과, 정원 마감이 <b>전부 같은 회색 한 가지</b>로 뭉개진다.
 * 손님은 "왜 안 눌리지"를 알 방법이 없고, 사장님은 "예약이 왜 안 들어오지"를 알 방법이 없다.
 *
 * <p>그래서 서버가 <b>사유를 내려준다.</b> 달력은 그것을 그대로 그리기만 한다 —
 * 프론트가 다시 판정하면 서버의 {@code Store.isBookableOn} 과 언젠가 어긋나고,
 * 그 순간 이 프로젝트가 계속 경계해 온 <b>"달력엔 눌리는데 예약하면 거절"</b>이 돌아온다.
 *
 * <h2>{@code openSlots} 가 "잔여 인원"이 아니라 "예약 가능한 시각 수"인 이유</h2>
 * 정원({@code maxCapacityPerSlot})은 <b>슬롯마다</b> 걸린다. 하루 전체의 "남은 자리"라는 수는
 * 애초에 존재하지 않는다(10시가 꽉 차도 11시는 비어 있다).
 * 하루 단위로 참인 것은 <b>"아직 고를 수 있는 시각이 몇 개인가"</b>뿐이다.
 * 세 가지 예약 방식에 모두 그대로 들어맞는다 —
 * SLOT 은 시간대 수, SESSION 은 남은 회차 수, DAY 는 0 또는 1 이다.
 */
@Getter
@AllArgsConstructor
public class CalendarDayResponse {

    /** {@code "2026-09-01"}. 프론트가 문자열로 비교하도록 ISO 고정 — 타임존이 끼어들 여지를 없앤다. */
    private String date;

    /** {@link DayStatus} 이름. */
    private String status;

    /** 그 날 구조적으로 존재하는 예약 시각 수(정원·현재시각 반영 전). {@code CLOSED} 등이면 0. */
    private int totalSlots;

    /** 지금 실제로 고를 수 있는 시각 수. {@code 0} 이면 {@code FULL} 이거나 예약 불가 상태다. */
    private int openSlots;

    /**
     * 공휴일(빨간날)인가 — <b>달력을 빨갛게 칠하는 용도일 뿐, 예약 가능 여부와 무관하다.</b>
     * 공휴일에도 여는 가게가 훨씬 많다. 쉬는 가게는 {@code closedDates} 로 이미 표현된다.
     *
     * <p>{@code status} 와 독립인 이유: 지난 공휴일도, 휴무인 공휴일도 공휴일은 공휴일이다.
     * 어떤 상태일 때 실제로 빨갛게 그릴지는 화면이 정한다(현재는 {@code OPEN} 일 때만).
     *
     * <p>키가 없거나 공공데이터포털이 죽어 있으면 <b>전부 {@code false}</b> 로 온다.
     * 그때도 달력은 정상이고 일요일만 빨갛게 나온다 — {@code HolidayService} 주석 참고.
     */
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
