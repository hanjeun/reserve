package kr.it.reserve.feed.service;

import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FeedProfileReviewReader implements ProfileReviewReader {
    private final ReviewRepository reviews;

    @Override
    public Page<FeedDto.ProfileReview> findPublished(Long memberId, boolean mine, LocalDateTime now, Pageable page) {
        return reviews.findPublishedProfileReviews(memberId, mine, now, page)
                .map(review -> new FeedDto.ProfileReview(review.getId(), review.getStore().getPublicId(), review.getStore().getName(),
                        review.getRating(), review.getTitle(), review.getContent(),
                        ReviewResponse.photoList(review).stream().map(photo ->
                                new FeedDto.ProfileReviewPhoto(photo.id(), photo.url(), photo.width(), photo.height())).toList(),
                        review.getCreatedAt().atOffset(ZoneOffset.UTC)));
    }
}
