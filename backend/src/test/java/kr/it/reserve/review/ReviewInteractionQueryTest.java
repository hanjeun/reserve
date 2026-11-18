package kr.it.reserve.review;

import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewInteractionResponse.Like;
import kr.it.reserve.review.dto.ReviewInteractionResponse.Summary;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.review.service.ReviewInteractions;
import kr.it.reserve.review.service.ReviewPhotos;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.review.service.ReviewMutationGuard;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@Import({ReviewInteractions.class, ReviewService.class, ReviewMutationGuard.class})
class ReviewInteractionQueryTest {
    @Autowired ReviewRepository reviews;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired ReviewInteractions interactions;
    @Autowired ReviewService reviewService;
    @Autowired ReservationRepository reservations;
    @MockitoBean FeedService feeds;
    @MockitoBean ReviewPhotos photos;

    @Test
    void likeAndCommentRetriesDoNotDuplicateAndAliasesStayPrivateInTheThread() {
        Member author = member("author");
        Member reader = member("reader");
        Store store = stores.save(Store.builder().owner(reader).name("리뷰 가게").build());
        Review review = reviews.save(Review.builder().member(author).store(store).rating(5)
                .title("방문 후기").content("예약을 이용했어요.").authorAlias("땅을 파는 두더지").build());
        Long id = review.getId();
        when(feeds.reviewAuthors(List.of(author.getId()), reader)).thenReturn(Map.of(author.getId(),
                new FeedDto.Profile("public-profile", "공개 닉네임", null, "https://example.invalid/avatar.png", true, FeedDto.AvatarSource.ACCOUNT)));

        assertThat(interactions.setLike(id, reader, true)).isEqualTo(new Like(true, 1));
        assertThat(interactions.setLike(id, reader, true)).isEqualTo(new Like(true, 1));
        UUID request = UUID.randomUUID();
        var posted = interactions.addComment(id, author, request, "  답변 내용  ");
        assertThat(posted.commentCount()).isEqualTo(1);
        assertThat(interactions.addComment(id, author, request, "재시도")).isEqualTo(posted);
        assertThat(interactions.summaries(List.of(id), reader)).containsEntry(id, new Summary(true, 1, 1));
        assertThat(interactions.summaries(List.of(id), null)).containsEntry(id, new Summary(false, 1, 1));

        var comment = interactions.list(id, reader, 0).getContent().getFirst();
        assertThat(comment.id()).isEqualTo(posted.commentId());
        assertThat(comment.content()).isEqualTo("답변 내용");
        assertThat(comment.authorName()).isEqualTo("땅을 파는 두더지");
        assertThat(comment.authorPublicId()).isNull();
        assertThat(comment.authorAvatarUrl()).isNull();
        assertThat(comment.mine()).isFalse();
        assertThatThrownBy(() -> interactions.deleteComment(id, comment.id(), reader))
                .isInstanceOfSatisfying(ReviewException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(interactions.deleteComment(id, comment.id(), author).commentCount()).isZero();
        assertThat(interactions.setLike(id, reader, false)).isEqualTo(new Like(false, 0));

        reviewService.moderateVisibility(id, true);
        assertThatThrownBy(() -> interactions.list(id, null, 0))
                .isInstanceOfSatisfying(ReviewException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> interactions.setLike(id, reader, true)).isInstanceOf(ReviewException.class);
    }

    private Member member(String id) {
        return members.save(Member.builder().name(id).email(id + "@review.example.invalid").termsAgreed(true).build());
    }

    @Test
    void oneCompletedVisitStaysConsumedAfterItsReviewIsRemoved() {
        Member customer = member("visited");
        Store store = stores.save(Store.builder().owner(member("host")).name("예약 리뷰 가게").build());
        Reservation older = completed(customer, store, 1);
        Reservation latest = completed(customer, store, 2);
        var request = new ReviewCreateRequest();
        request.setReservationId(latest.getId());
        request.setRating(5);
        request.setTitle("방문 후기");
        request.setContent("예약을 이용하고 리뷰를 남겼어요.");
        assertThat(reviewable(customer, store)).extracting(Reservation::getId).containsExactly(latest.getId(), older.getId());
        assertThat(reviewService.canWriteReview(latest.getId(), customer)).isTrue();

        Long reviewId = reviewService.createReview(request, customer).getId();
        assertThat(reviewService.canWriteReview(latest.getId(), customer)).isFalse();
        assertThat(reviewable(customer, store)).extracting(Reservation::getId).containsExactly(older.getId());

        reviewService.deleteReview(reviewId, customer);
        reviews.flush();
        assertThat(reviews.existsByReservationId(latest.getId())).isFalse();
        assertThat(reservations.findById(latest.getId())).get().matches(Reservation::isReviewWritten);
        assertThat(reviewable(customer, store)).extracting(Reservation::getId).containsExactly(older.getId());
        assertThat(reviewService.canWriteReview(latest.getId(), customer)).isFalse();
        assertThatThrownBy(() -> reviewService.createReview(request, customer))
                .isInstanceOfSatisfying(ReviewException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void aHiddenLegacyReviewConsumesTheVisitWithoutReturningADeadReviewLink() {
        Member customer = member("legacy");
        Store store = stores.save(Store.builder().owner(member("legacy-host")).name("기존 리뷰 가게").build());
        Reservation visit = completed(customer, store, 1);
        reviews.saveAndFlush(Review.builder().member(customer).store(store).reservation(visit).rating(3)
                .title("숨겨진 리뷰").content("이전에 등록한 리뷰예요.").moderationHidden(true).build());
        assertThat(reservations.findReviewIdsByReservationIds(List.of(visit.getId()))).singleElement()
                .satisfies(row -> { assertThat(row[0]).isEqualTo(visit.getId()); assertThat(row[1]).isNull(); });
        assertThat(reviewable(customer, store)).isEmpty();
        assertThat(reviewService.canWriteReview(visit.getId(), customer)).isFalse();
    }

    private Reservation completed(Member customer, Store store, int day) {
        return reservations.save(Reservation.builder().member(customer).store(store).guestCount(1)
                .reservationDate(LocalDate.of(2026, 1, day)).reservationTime(LocalTime.NOON)
                .status(Reservation.ReservationStatus.COMPLETED).build());
    }

    private List<Reservation> reviewable(Member member, Store store) {
        return reservations.findReviewableVisits(member.getId(), store.getId(), Reservation.ReservationStatus.COMPLETED, PageRequest.of(0, 5));
    }
}
