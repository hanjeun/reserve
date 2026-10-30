package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.entity.Reservation;
import org.springframework.http.HttpStatus;

/** 목록 숨김과 휴지통 복구도 진행 중 예약의 정원을 바꾸지 않도록 해요. */
public final class ReservationRemovalPolicy {
    private ReservationRemovalPolicy() { }

    public static boolean finished(Reservation reservation) {
        return reservation != null && reservation.getStatus() != null && switch (reservation.getStatus()) {
            case COMPLETED, CANCELLED, REJECTED, NO_SHOW -> true;
            default -> false;
        };
    }

    public static void requireFinished(Reservation reservation) {
        if (!finished(reservation)) throw new ReservationException(
                "완료·취소·거절·노쇼 상태의 예약만 목록에서 삭제하거나 복구할 수 있어요.", HttpStatus.BAD_REQUEST);
    }
}
