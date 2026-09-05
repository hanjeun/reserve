package kr.it.reserve.review;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 비로그인 사용자도 받는 공개 리뷰 응답에 회원 이메일이 다시 섞이지 않도록 고정한다.
 */
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
                .rating(5)
                .title("좋았어요")
                .content("다시 방문하고 싶은 가게입니다.")
                .build();

        String json = objectMapper.writeValueAsString(ReviewResponse.fromEntity(review));
        JsonNode response = objectMapper.readTree(json);

        assertThat(response.has("memberEmail")).isFalse();
        assertThat(json).doesNotContain(PRIVATE_EMAIL);
        assertThat(response.path("memberId").asLong()).isEqualTo(author.getId());
    }
}
