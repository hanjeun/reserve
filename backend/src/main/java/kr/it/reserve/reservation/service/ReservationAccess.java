package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import org.springframework.http.HttpStatus;

/** All reservation workflows share the same member/owner and approved attendance policy. */
final class ReservationAccess {
    private ReservationAccess() {}
    static void member(Reservation reservation, Member member) {
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReservationException("해당 예약에 대한 권한이 없어요.", HttpStatus.FORBIDDEN);
        }
    }

    static void owner(Reservation reservation, Member owner) {
        if (owner.isAdmin()) return; // 관리자는 모든 예약 접근 가능
        if (!reservation.getStore().getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("가게 소유자만 접근할 수 있어요.", HttpStatus.FORBIDDEN);
        }
    }

    static boolean approved(Reservation reservation) {
        return reservation.getStatus() == Reservation.ReservationStatus.CONFIRMED
                || reservation.getStatus() == Reservation.ReservationStatus.UNCONFIRMED;
    }
}
