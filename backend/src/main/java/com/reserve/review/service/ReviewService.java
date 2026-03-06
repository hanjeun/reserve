package com.reserve.review.service;

import com.reserve.global.error.ReviewException;
import com.reserve.member.entity.Member;
import com.reserve.reservation.entity.Reservation;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.dto.ReviewCreateRequest;
import com.reserve.review.dto.ReviewResponse;
import com.reserve.review.dto.ReviewUpdateRequest;
import com.reserve.review.entity.Review;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@RequiredArgsConstructor
@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;

    /**
     * 리뷰 작성
     */
    @Transactional
    public ReviewResponse createReview(ReviewCreateRequest request, Member member) {
        log.info("리뷰 작성 시작: reservationId={}, memberId={}", request.getReservationId(), member.getId());

        Reservation reservation = reservationRepository.findById(request.getReservationId())
                .orElseThrow(() -> new ReviewException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 작성 자격 검증 (분리된 메서드 호출)
        validateReviewEligibility(reservation, member);

        Review review = Review.builder()
                .member(member)
                .store(reservation.getStore())
                .reservation(reservation)
                .rating(request.getRating())
                .title(request.getTitle())
                .content(request.getContent())
                .build();

        Review savedReview = reviewRepository.save(review);
        log.info("리뷰 작성 완료: reviewId={}", savedReview.getId());

        updateStoreRating(reservation.getStore());

        return ReviewResponse.fromEntity(savedReview);
    }

    /**
     * 리뷰 삭제
     */
    @Transactional
    public void deleteReview(Long reviewId, Member member) {
        Review review = findReviewByIdOrThrow(reviewId);
        validateReviewOwnership(review, member);

        Store store = review.getStore();
        reviewRepository.delete(review);
        log.info("리뷰 삭제 완료: reviewId={}", reviewId);

        updateStoreRating(store);
    }

    /**
     * 리뷰 수정
     */
    @Transactional
    public ReviewResponse updateReview(Long reviewId, ReviewUpdateRequest request, Member member) {
        Review review = findReviewByIdOrThrow(reviewId);
        validateReviewOwnership(review, member);

        review.update(request.getRating(), request.getTitle(), request.getContent());
        log.info("리뷰 수정 완료: reviewId={}", reviewId);

        updateStoreRating(review.getStore());

        return ReviewResponse.fromEntity(review);
    }

    /**
     * 단일 리뷰 조회
     */
    @Transactional(readOnly = true)
    public ReviewResponse getReview(Long reviewId) {
        return ReviewResponse.fromEntity(findReviewByIdOrThrow(reviewId));
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getStoreReviews(Long storeId) {
        return reviewRepository.findByStoreIdOrderByCreatedAtDesc(storeId).stream()
                .map(ReviewResponse::fromEntity).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getMyReviews(Member member) {
        return reviewRepository.findByMemberOrderByCreatedAtDesc(member).stream()
                .map(ReviewResponse::fromEntity).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Double getAverageRating(Long storeId) {
        Double avg = reviewRepository.findAverageRatingByStoreId(storeId);
        return avg != null ? Math.round(avg * 10) / 10.0 : 0.0;
    }

    @Transactional(readOnly = true)
    public long getReviewCount(Long storeId) {
        return reviewRepository.countByStoreId(storeId);
    }

    @Transactional(readOnly = true)
    public ReviewResponse getReviewByReservationId(Long reservationId) {
        return reviewRepository.findByReservationId(reservationId)
                .map(ReviewResponse::fromEntity)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean canWriteReview(Long reservationId, Member member) {
        return reservationRepository.findById(reservationId)
                .map(res -> res.getMember().getId().equals(member.getId()) &&
                        res.getStatus() == Reservation.ReservationStatus.COMPLETED &&
                        !reviewRepository.existsByReservationId(reservationId))
                .orElse(false);
    }

    // ========== 내부 도우미 메서드 (Private Helper Methods) ==========

    /**
     * 리뷰 CUD 후 가게 평점/리뷰수 갱신
     */
    private void updateStoreRating(Store store) {
        Long storeId = store.getId();
        // LAZY 프록시 충돌 방지: DB에서 직접 조회한 엔티티에 갱신
        Store managed = storeRepository.findById(storeId)
                .orElseThrow(() -> new RuntimeException("가게를 찾을 수 없습니다: " + storeId));
        Double avg = reviewRepository.findAverageRatingByStoreId(storeId);
        long count = reviewRepository.countByStoreId(storeId);
        managed.setRating(avg != null ? Math.round(avg * 10) / 10.0 : null);
        managed.setReviewCount((int) count);
        storeRepository.save(managed);
        log.info("가게 평점 갱신: storeId={}, rating={}, reviewCount={}", storeId, managed.getRating(), managed.getReviewCount());
    }

    private Review findReviewByIdOrThrow(Long id) {
        return reviewRepository.findById(id)
                .orElseThrow(() -> new ReviewException("리뷰를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private void validateReviewOwnership(Review review, Member member) {
        if (!review.getMember().getId().equals(member.getId())) {
            throw new ReviewException("본인의 리뷰만 관리할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
    }

    private void validateReviewEligibility(Reservation reservation, Member member) {
        // 1. 본인 확인
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReviewException("본인의 예약에만 리뷰를 작성할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
        // 2. 상태 확인
        if (reservation.getStatus() != Reservation.ReservationStatus.COMPLETED) {
            throw new ReviewException("이용완료된 예약에만 리뷰를 작성할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
        // 3. 중복 확인
        if (reviewRepository.existsByReservationId(reservation.getId())) {
            throw new ReviewException("이미 리뷰를 작성한 예약입니다.", HttpStatus.CONFLICT);
        }
    }
}