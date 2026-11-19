package kr.it.reserve.review;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.review.dto.ReviewInteractionResponse.Summary;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewResponsePrivacyTest {

    private static final String PRIVATE_EMAIL = "review-author-private@example.com";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("공개 리뷰 응답은 작성자 이메일을 직렬화하지 않는다")
    void publicReviewResponseDoesNotExposeMemberEmail() throws Exception {
        Member author = Member.builder()
                .id(10L)
                .name("리뷰 작성자")
                .email(PRIVATE_EMAIL)
                .build();
        Store store = Store.builder()
                .id(20L)
                .name("테스트 가게")
                .build();
        Review review = Review.builder()
                .id(30L)
                .member(author)
                .store(store)
                .reservation(Reservation.builder().id(40L).build())
                .rating(5)
                .title("좋았어요")
                .content("다시 방문하고 싶은 가게입니다.")
                .build();

        String json = objectMapper.writeValueAsString(ReviewResponse.fromEntity(review));
        JsonNode response = objectMapper.readTree(json);

        assertThat(response.has("memberEmail")).isFalse();
        assertThat(json).doesNotContain(PRIVATE_EMAIL, author.getName());
        assertThat(response.path("memberId").isNull()).isTrue();
        assertThat(response.path("reservationId").isNull()).isTrue();
    }

    @Test
    void profilePhotoIsShownOnlyForProfileNamedReviews() {
        var member = Member.builder().id(7L).name("테스트 실명").build();
        var store = Store.builder().id(8L).build();
        var review = Review.builder().id(9L).member(member).store(store).build();
        var profile = new FeedDto.Profile("public-profile", "공개 닉네임", null,
                "https://example.invalid/avatar.png", false, FeedDto.AvatarSource.CUSTOM);

        var visible = ReviewResponse.fromEntity(review, profile, false, Summary.EMPTY);
        assertThat(visible.getMemberName()).isEqualTo("공개 닉네임");
        assertThat(visible.getAuthorAvatarUrl()).isEqualTo(profile.avatarUrl());
        assertThat(visible.getAuthorPublicId()).isEqualTo(profile.publicId());
        assertThat(visible.getMemberId()).isNull();

        review.setAuthorAlias("땅을 파는 두더지");
        var anonymous = ReviewResponse.fromEntity(review, profile, false, Summary.EMPTY);
        assertThat(anonymous.getMemberName()).isEqualTo("땅을 파는 두더지");
        assertThat(anonymous.getAuthorPublicId()).isNull();
        assertThat(anonymous.getAuthorAvatarUrl()).isNull();
    }
}
