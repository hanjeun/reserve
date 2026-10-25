package kr.it.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 반복 스캔도 성공하는 멱등 체크인이므로 최초 처리 여부를 응답 데이터에 별도로 담는다. */
@Getter
@AllArgsConstructor
public class QrCheckinResponse {

    private final ReservationResponse reservation;

    /** {@code true} 면 이 스캔 이전에 이미 출석 기록이 있었다(= 이번 스캔으로 바뀐 게 없다). */
    private final boolean alreadyCheckedIn;
}
