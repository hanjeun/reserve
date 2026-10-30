package kr.it.reserve.reservation.dto;

/** 종료된 신청은 예약 원문 없이 알리며 새 신청은 별도의 생성 관문을 거쳐요. */
public record ReservationRequestResult(Outcome outcome, ReservationResponse reservation) {
    public enum Outcome { NOT_SUBMITTED, RESERVED, CLOSED }

    public static ReservationRequestResult notSubmitted() {
        return new ReservationRequestResult(Outcome.NOT_SUBMITTED, null);
    }

    public static ReservationRequestResult reserved(ReservationResponse reservation) {
        return new ReservationRequestResult(Outcome.RESERVED, reservation);
    }

    public static ReservationRequestResult closed() {
        return new ReservationRequestResult(Outcome.CLOSED, null);
    }
}
