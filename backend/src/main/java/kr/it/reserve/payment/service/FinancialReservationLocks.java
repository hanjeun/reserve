package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.springframework.http.HttpStatus;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

/** 호출자의 짧은 TX에서 회원 ID 오름차순 → 예약 단일 행을 잠근 뒤 결제 잠금을 허용한다. */
final class FinancialReservationLocks {
    private final MemberRepository members;
    private final ReservationRepository reservations;
    private final EntityManager entityManager;

    FinancialReservationLocks(MemberRepository members, ReservationRepository reservations, EntityManager entityManager) {
        this.members = members;
        this.reservations = reservations;
        this.entityManager = entityManager;
    }

    Locked lock(Long reservationId, Long actorId) {
        Long payerId = reservations.findMemberIdById(reservationId).orElseThrow(ReservationException::notFound);
        TreeSet<Long> ordered = new TreeSet<>();
        ordered.add(payerId);
        reservations.findOwnerIdById(reservationId).ifPresent(ordered::add);
        if (actorId != null) ordered.add(actorId);
        Map<Long, Member> locked = new HashMap<>();
        for (Long memberId : ordered) {
            // 탈퇴 후에도 거래 이력의 환불은 진행할 수 있다. 외부 요청자의 활성 여부만 아래에서 확인한다.
            locked.put(memberId, members.findByIdForPaymentUpdate(memberId).orElseThrow(MemberException::notFound));
        }
        // 중첩 호출에서 이미 바꾼 취소 결정·pending을 먼저 flush해 refresh가 지우지 않게 한다.
        entityManager.flush();
        for (Long memberId : ordered) entityManager.refresh(locked.get(memberId), LockModeType.PESSIMISTIC_WRITE);
        Member actor = actorId == null ? null : locked.get(actorId);
        if (actor != null && actor.getDeletedAt() != null) throw MemberException.notFound();
        Reservation reservation = reservations.findByIdForPaymentUpdate(reservationId)
                .orElseThrow(ReservationException::notFound);
        entityManager.flush();
        entityManager.refresh(reservation, LockModeType.PESSIMISTIC_WRITE);
        if (reservation.getMember() == null || !Objects.equals(payerId, reservation.getMember().getId())) {
            throw new PaymentException("예약 정보가 변경됐어요. 다시 시도해주세요.", HttpStatus.CONFLICT);
        }
        return new Locked(reservation, actor);
    }

    record Locked(Reservation reservation, Member actor) { }
}
