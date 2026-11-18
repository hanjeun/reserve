package kr.it.reserve.review;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class ReviewPhotoQueryTest {
    @Autowired ReviewRepository reviews;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired EntityManager entityManager;

    @Test
    void publicPhotoRequiresTheMatchingVisibleReviewAndDisappearsOnRemoval() {
        Member owner = members.save(Member.builder().name("사업자").email("photo-owner@example.invalid").build());
        Member customer = members.save(Member.builder().name("고객").email("photo-customer@example.invalid").build());
        Store store = stores.save(Store.builder().owner(owner).name("사진 검증 가게").build());
        Review review = Review.builder().member(customer).store(store).rating(5).title("사진 리뷰").content("사진을 포함한 리뷰예요.").build();
        ReviewPhoto photo = new ReviewPhoto(review, "synthetic.bin", "image/png", 180, 320);
        review.getPhotos().add(photo);
        reviews.saveAndFlush(review);
        Long reviewId = review.getId();
        Long photoId = photo.getId();
        entityManager.clear();

        Review saved = reviews.findByStoreIdOrderByCreatedAtDesc(store.getId()).getFirst();
        assertThat(ReviewResponse.fromEntity(saved).getPhotos()).containsExactly(new ReviewResponse.Photo(photoId,
                "/api/reviews/" + reviewId + "/photos/" + photoId, 180, 320));
        assertThat(reviews.findPublishedPhoto(reviewId, photoId)).isPresent();
        assertThat(reviews.findPublishedPhoto(reviewId + 1, photoId)).isEmpty();

        saved.setModerationHidden(true);
        reviews.flush();
        assertThat(ReviewResponse.fromEntity(saved).getPhotos()).isEmpty();
        assertThat(reviews.findPublishedPhoto(reviewId, photoId)).isEmpty();

        saved.setModerationHidden(false);
        saved.getPhotos().clear();
        reviews.flush();
        assertThat(reviews.findPublishedPhoto(reviewId, photoId)).isEmpty();
    }
}
