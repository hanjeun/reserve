package kr.it.reserve.review.service;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewInteractionResponse.Summary;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.dto.ReviewUpdateRequest;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ReservationRepository reservationRepository;
    private final ReviewMutationGuard mutations;
    private final ReviewPhotos photos;
    private final ReviewAuthorReader feeds;
    private final ReviewInteractions interactions;
    @Autowired(required = false)
    private ReviewUpdates updates;

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReviewResponse createReview(ReviewCreateRequest request, Member member) {
        return createReview(request, member, List.of());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReviewResponse createReview(ReviewCreateRequest request, Member member, List<MultipartFile> files) {
        log.info("Review created: reservationId={}, memberId={}", request.getReservationId(), member.getId());

        Member author = mutations.lockAuthor(member.getId());
        if (author.isDeleted() || author.isSuspended()) {
            throw new ReviewException("현재 리뷰를 작성할 수 없어요.", HttpStatus.FORBIDDEN);
        }
        if (!author.isTermsAgreed()) {
            throw new ReviewException("서비스 이용 약관에 동의해야 리뷰를 작성할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        Reservation reservation = mutations.lockReservation(request.getReservationId())
                .orElseThrow(() -> new ReviewException("예약을 찾을 수 없어요.", HttpStatus.NOT_FOUND));

        validateReviewEligibility(reservation, author);
        Store store = mutations.lockStore(reservation.getStore().getId());
        mutations.consumeVisit(reservation);

        Review review = Review.builder()
                .member(author)
                .store(store)
                .reservation(reservation)
                .rating(request.getRating())
                .title(request.getTitle())
                .content(request.getContent())
                .authorAlias(normalizeAlias(request.getAuthorAlias()))
                .build();

        photos.update(review, List.of(), files);
        Review savedReview = reviewRepository.saveAndFlush(review);
        log.info("Review created: reviewId={}", savedReview.getId());

        mutations.updateRating(store);
        if (updates != null) updates.changed(savedReview, EntityUpdates.Operation.CREATED);

        return response(savedReview, author, Summary.EMPTY);
    }

    @Transactional
    public void deleteReview(Long reviewId, Member member) {
        Review review = findReviewForUpdate(reviewId);
        validateReviewOwnership(review, member);

        Store store = review.getStore();
        if (review.getReservation() != null) review.getReservation().setReviewWritten(true);
        photos.enqueueDeletion(review.getPhotos(), reviewId);
        reviewRepository.delete(review);
        log.info("Review deleted: reviewId={}", reviewId);

        mutations.updateRating(store);
        if (updates != null) updates.changed(review, EntityUpdates.Operation.DELETED);
    }

    @Transactional
    public ReviewResponse updateReview(Long reviewId, ReviewUpdateRequest request, Member member) {
        return updateReview(reviewId, request, member, List.of(), List.of());
    }

    @Transactional
    public ReviewResponse updateReview(Long reviewId, ReviewUpdateRequest request, Member member,
                                       List<Long> removedIds, List<MultipartFile> files) {
        Review review = findReviewForUpdate(reviewId);
        validateReviewOwnership(review, member);

        photos.update(review, removedIds, files);
        review.update(request.getRating(), request.getTitle(), request.getContent());
        if (request.getAuthorAlias() != null) review.setAuthorAlias(normalizeAlias(request.getAuthorAlias()));
        reviewRepository.flush();
        log.info("Review updated: reviewId={}", reviewId);

        mutations.updateRating(review.getStore());
        if (updates != null) updates.changed(review, EntityUpdates.Operation.UPDATED);

        return responses(List.of(review), member).getFirst();
    }

    /**
     * 단일 리뷰 조회
     */
    @Transactional(readOnly = true)
    public ReviewResponse getReview(Long reviewId, Member viewer) {
        return responses(List.of(requirePublished(findReviewByIdOrThrow(reviewId))), viewer).getFirst();
    }

    @Transactional(readOnly = true)
    public ReviewPhotos.ImageContent getPhoto(Long reviewId, Long photoId) {
        var photo = reviewRepository.findPublishedPhoto(reviewId, photoId)
                .filter(row -> !row.getReview().getStore().isDeleted() && !row.getReview().getStore().isSuspended())
                .orElseThrow(() -> new ReviewException("리뷰 사진을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        return photos.read(photo);
    }

    @Transactional
    public ReviewResponse replyAsOwner(Long id, Member owner, String reply) {
        Review review = requirePublished(findReviewForUpdate(id));
        Store store = review.getStore();
        if (store.isDeleted() || store.getOwner() == null || !owner.getId().equals(store.getOwner().getId())) {
            throw new ReviewException("본인 가게의 리뷰에만 답변할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        review.setOwnerReply(reply.strip());
        review.setOwnerRepliedAt(kr.it.reserve.global.common.ServiceTime.now());
        if (updates != null) updates.changed(review, EntityUpdates.Operation.UPDATED);
        return responses(List.of(review), owner).getFirst();
    }

    @Transactional
    public void moderateVisibility(Long id, boolean hidden) {
        Review review = findReviewForUpdate(id);
        if (review.isModerationHidden() == hidden) return;
        review.setModerationHidden(hidden);
        mutations.updateRating(review.getStore());
        if (updates != null) updates.changed(review, EntityUpdates.Operation.UPDATED);
    }

    private Review requirePublished(Review review) {
        if (!review.isPublished()) throw new ReviewException("리뷰를 찾을 수 없어요.", HttpStatus.NOT_FOUND);
        return review;
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getStoreReviews(Long storeId, Member viewer) {
        var reviews = reviewRepository.findByStoreIdOrderByCreatedAtDesc(storeId).stream().filter(Review::isPublished).toList();
        return responses(reviews, viewer);
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getMyReviews(Member member) {
        return responses(reviewRepository.findByMemberOrderByCreatedAtDesc(member), member);
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
    public ReviewResponse getReviewByReservationId(Long reservationId, Member member) {
        return reviewRepository.findByReservationId(reservationId)
                .filter(review -> review.getMember().getId().equals(member.getId()) && review.isPublished())
                .map(review -> responses(List.of(review), member).getFirst())
                .orElse(null);
    }

    private List<ReviewResponse> responses(List<Review> reviews, Member viewer) {
        if (reviews.isEmpty()) return List.of();
        var authors = feeds.reviewAuthors(reviews.stream().filter(review -> review.getAuthorAlias() == null)
                .map(review -> review.getMember().getId()).distinct().toList(), viewer);
        var summaries = interactions.summaries(reviews.stream().filter(Review::isPublished).map(Review::getId).toList(), viewer);
        return reviews.stream().map(review -> {
            Long authorId = review.getMember().getId();
            boolean mine = viewer != null && authorId.equals(viewer.getId());
            return ReviewResponse.fromEntity(review, authors.get(authorId), mine, summaries.getOrDefault(review.getId(), Summary.EMPTY));
        }).toList();
    }

    private ReviewResponse response(Review review, Member author, Summary summary) {
        var profile = review.getAuthorAlias() == null ? feeds.reviewAuthors(List.of(author.getId()), author).get(author.getId()) : null;
        return ReviewResponse.fromEntity(review, profile, true, summary);
    }

    private static String normalizeAlias(String alias) {
        return alias == null || alias.isBlank() ? null : alias.strip();
    }

    @Transactional(readOnly = true)
    public boolean canWriteReview(Long reservationId, Member member) {
        if (!member.isTermsAgreed()) return false;
        return reservationRepository.findById(reservationId)
                .map(res -> res.getMember().getId().equals(member.getId()) &&
                        isCompletedVisit(res) && !hasWrittenReview(res))
                .orElse(false);
    }

    private Review findReviewByIdOrThrow(Long id) {
        return reviewRepository.findById(id)
                .filter(review -> !review.isDeleted())
                .orElseThrow(() -> new ReviewException("리뷰를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }

    private Review findReviewForUpdate(Long id) {
        return mutations.lockReview(id, false)
                .orElseThrow(() -> new ReviewException("리뷰를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }

    private void validateReviewOwnership(Review review, Member member) {
        if (!review.getMember().getId().equals(member.getId())) {
            throw new ReviewException("본인의 리뷰만 관리할 수 있어요.", HttpStatus.FORBIDDEN);
        }
    }

    private void validateReviewEligibility(Reservation reservation, Member member) {
        // 1. 본인 확인
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReviewException("본인의 예약에만 리뷰를 작성할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        // 2. 상태 확인
        if (!isCompletedVisit(reservation)) {
            throw new ReviewException("이용완료된 예약에만 리뷰를 작성할 수 있어요.", HttpStatus.BAD_REQUEST);
        }
        // 3. 중복 확인
        if (hasWrittenReview(reservation)) {
            throw new ReviewException("이미 리뷰를 작성한 예약이에요.", HttpStatus.CONFLICT);
        }
    }

    private static boolean isCompletedVisit(Reservation reservation) {
        return !reservation.isDeleted() && reservation.getStatus() == Reservation.ReservationStatus.COMPLETED;
    }

    private boolean hasWrittenReview(Reservation reservation) {
        return reservation.isReviewWritten() || reviewRepository.existsByReservationId(reservation.getId());
    }
}
