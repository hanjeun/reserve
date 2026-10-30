package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import org.springframework.http.HttpStatus;

/** 예약의 회원·소유자 확인과 승인된 방문 상태 정책을 공통으로 적용한다. */
final class ReservationAccess {
    private ReservationAccess() {}
    static void member(Reservation reservation, Member member) {
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReservationException("해당 예약에 대한 권한이 없어요.", HttpStatus.FORBIDDEN);
        }
    }

    static void participant(Reservation reservation, Member member) {
        if (!reservation.getMember().getId().equals(member.getId())
                && !reservation.getStore().getOwner().getId().equals(member.getId())) {
            throw new ReservationException("해당 예약에 대한 권한이 없어요.", HttpStatus.FORBIDDEN);
        }
    }

    static void editable(Reservation reservation, Member member) {
        member(reservation, member);
        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING
                && reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("완료·취소·거절·노쇼된 예약은 변경할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        if (ReservationPaymentPolicy.expiredAt(reservation, java.time.LocalDateTime.now(java.time.Clock.systemDefaultZone()))) {
            throw new ReservationException("결제 기한이 지난 예약은 변경할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new ReservationException(
                    "이미 결제된 예약은 변경할 수 없어요. 취소 후 다시 예약해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    static void owner(Reservation reservation, Member owner) {
        if (!reservation.getStore().getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("가게 소유자만 접근할 수 있어요.", HttpStatus.FORBIDDEN);
        }
    }

    static boolean approved(Reservation reservation) {
        return reservation.getStatus() == Reservation.ReservationStatus.CONFIRMED
                || reservation.getStatus() == Reservation.ReservationStatus.UNCONFIRMED;
    }
}
