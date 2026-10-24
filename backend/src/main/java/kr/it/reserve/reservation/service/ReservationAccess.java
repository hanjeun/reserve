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

    static void editable(Reservation reservation, Member member) {
        member(reservation, member);
        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING
                && reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("완료·취소·거절·노쇼된 예약은 변경할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new ReservationException(
                    "이미 결제된 예약은 변경할 수 없어요. 취소 후 다시 예약해주세요.", HttpStatus.BAD_REQUEST);
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
