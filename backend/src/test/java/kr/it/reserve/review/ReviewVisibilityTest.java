package kr.it.reserve.review;

import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.review.service.ReviewInteractions;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.review.service.ReviewMutationGuard;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewVisibilityTest {
    private final ReviewRepository reviews = mock(ReviewRepository.class);
    private final ReviewService service = new ReviewService(reviews, mock(ReservationRepository.class), mock(ReviewMutationGuard.class),
            mock(kr.it.reserve.review.service.ReviewPhotos.class), mock(FeedService.class), mock(ReviewInteractions.class));

    @Test void hiddenReviewCannotBeReadByDirectIdOrReservationOrChangedByItsAuthor() {
        var author = Member.builder().id(7L).build();
        var hidden = Review.builder().id(10L).member(author).deletedAt(LocalDateTime.now()).build();
        when(reviews.findById(10L)).thenReturn(Optional.of(hidden));
        when(reviews.findByReservationId(20L)).thenReturn(Optional.of(hidden));
        assertThatThrownBy(() -> service.getReview(10L, null)).isInstanceOf(ReviewException.class);
        assertThat(service.getReviewByReservationId(20L, author)).isNull();
        assertThatThrownBy(() -> service.updateReview(10L, null, author)).isInstanceOf(ReviewException.class);
        assertThatThrownBy(() -> service.deleteReview(10L, author)).isInstanceOf(ReviewException.class);
        verify(reviews, never()).delete(any());
        assertThat(hidden.isDeleted()).isTrue();
    }

    @Test void visibleReviewRemainsReadableAndTheStoredEntityIsPreserved() {
        var review = Review.builder().id(10L).member(Member.builder().id(7L).name("합성 작성자").build())
                .store(Store.builder().id(30L).name("합성 가게").build()).title("합성 리뷰").build();
        when(reviews.findById(10L)).thenReturn(Optional.of(review));
        assertThat(service.getReview(10L, null).getTitle()).isEqualTo("합성 리뷰");
        var anotherMember = Member.builder().id(8L).build();
        when(reviews.findByReservationId(20L)).thenReturn(Optional.of(review));
        assertThat(service.getReviewByReservationId(20L, anotherMember)).isNull();
        assertThat(review.isDeleted()).isFalse();
    }
}
