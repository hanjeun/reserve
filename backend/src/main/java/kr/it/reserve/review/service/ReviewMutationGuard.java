package kr.it.reserve.review.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class ReviewMutationGuard {
    private final ReviewRepository reviews;
    private final ReservationRepository reservations;
    private final StoreRepository stores;
    private final MemberRepository members;
    @PersistenceContext private EntityManager entityManager;

    public Member lockAuthor(Long memberId) {
        // 리뷰와 반응의 회원 FK 잠금도 금융 경로처럼 예약·가게보다 먼저 확보한다.
        detachLoaded(Member.class, memberId);
        return members.findByIdForPaymentUpdate(memberId)
                .orElseThrow(() -> new ReviewException("회원을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }

    public Optional<Reservation> lockReservation(Long reservationId) {
        detachLoaded(Reservation.class, reservationId);
        return reservations.findByIdForPaymentUpdate(reservationId);
    }

    public void consumeVisit(Reservation reservation) {
        if (reservations.consumeReviewVisit(reservation.getId()) != 1) {
            throw new ReviewException("이미 리뷰를 작성한 예약이에요.", HttpStatus.CONFLICT);
        }
        // 조건부 DML의 현재 값과 관리 엔티티를 맞춰 후속 flush가 소비 상태를 되돌리지 않게 한다.
        entityManager.refresh(reservation, LockModeType.PESSIMISTIC_WRITE);
        reservation.setReviewWritten(true);
    }

    public Store lockStore(Long storeId) {
        detachLoaded(Store.class, storeId);
        return stores.findByIdForUpdate(storeId)
                .orElseThrow(() -> new ReviewException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }

    public Optional<Review> lockReview(Long reviewId, boolean includeDeleted) {
        var scope = reviews.findMutationScope(reviewId).orElse(null);
        if (scope == null) return Optional.empty();
        // 예약 → 가게 → 리뷰 순서를 지켜 이용완료 복구 및 자식 FK 삽입과 잠금이 역전되지 않게 한다.
        if (scope.getReservationId() != null) lockReservation(scope.getReservationId());
        lockStore(scope.getStoreId());
        detachLoaded(Review.class, reviewId);
        var review = includeDeleted ? reviews.findAnyForUpdate(reviewId) : reviews.findForUpdate(reviewId);
        return review.filter(row -> includeDeleted || !row.isDeleted());
    }

    public Optional<Review> lockInteractionReview(Long reviewId) {
        detachLoaded(Review.class, reviewId);
        return reviews.findForUpdate(reviewId);
    }

    public void updateRating(Store store) {
        // UPDATE 하위 조회는 MySQL RR의 앞선 일반 조회 snapshot 대신 현재 리뷰 행을 읽는다.
        stores.updateReviewRating(store.getId());
        entityManager.refresh(store, LockModeType.PESSIMISTIC_WRITE);
    }

    private void detachLoaded(Class<?> type, Long id) {
        // 이미 잠긴 엔티티의 refresh가 일반 조회로 낮아져 RR snapshot을 다시 읽지 않게 해당 행만 재조회한다.
        entityManager.flush();
        entityManager.detach(entityManager.getReference(type, id));
    }
}
