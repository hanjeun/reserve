package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.StaleReadyReconciliationResponse;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/** 종료 예약의 남은 결제만 잠금 밖에서 확인하고, 삭제는 기존 금융 관문으로 다시 검사해요. */
@Service
@RequiredArgsConstructor
public class ReservationRemovalService {
    private final ReservationRepository reservations;
    private final PaymentRepository payments;
    private final PaymentService paymentService;
    private final ReservationService reservationService;
    private final PlatformTransactionManager transactions;

    @Transactional(propagation = Propagation.NEVER)
    public void remove(Long reservationId, Member actor) {
        var snapshot = new TransactionTemplate(transactions);
        snapshot.setReadOnly(true);
        List<Long> readyIds = snapshot.execute(ignored -> {
            var reservation = reservations.findById(reservationId)
                    .orElseThrow(() -> new ReservationException("예약을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
            ReservationAccess.participant(reservation, actor);
            ReservationRemovalPolicy.requireFinished(reservation);
            return payments.findReadyByReservationId(reservationId).stream()
                    .limit(10).map(payment -> payment.getId()).toList();
        });
        for (Long paymentId : readyIds) {
            var outcome = paymentService.reconcileStaleReadyPayment(paymentId).outcome();
            if (outcome != StaleReadyReconciliationResponse.Outcome.CLOSED_AS_NOT_PAID
                    && outcome != StaleReadyReconciliationResponse.Outcome.ALREADY_RESOLVED) {
                throw new ReservationException("결제·환불 확인이 끝난 후 예약을 삭제할 수 있어요.", HttpStatus.CONFLICT);
            }
        }
        // 관측 중 결제·환불·예약 상태가 바뀔 수 있어 같은 잠금 순서로 최종 판정해요.
        reservationService.removeReservation(reservationId, actor);
    }
}
