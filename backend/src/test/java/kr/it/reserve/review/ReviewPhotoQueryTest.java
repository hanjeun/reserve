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
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;

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
        String url = "/api/reviews/" + reviewId + "/photos/" + photoId;
        assertThat(ReviewResponse.fromEntity(saved).getPhotos()).containsExactly(new ReviewResponse.Photo(photoId,
                url, 180, 320, url + "?size=thumbnail"));
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

    @Test
    void storeReviewCursorOrdersPublishedRowsAndUsesIdToBreakTies() {
        Member owner = members.save(Member.builder().name("점주").email("cursor-owner@example.invalid").build());
        Store store = stores.save(Store.builder().owner(owner).name("리뷰 페이지 검증 가게").build());
        Review first = storeReview(store, owner, "첫 번째", false);
        Review second = storeReview(store, owner, "두 번째", false);
        storeReview(store, owner, "숨겨진 리뷰", true);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime written = now.minusDays(1).withNano(0);
        entityManager.createQuery("UPDATE Review r SET r.createdAt = :written WHERE r.store.id = :storeId")
                .setParameter("written", written).setParameter("storeId", store.getId()).executeUpdate();
        entityManager.clear();
        var size = PageRequest.ofSize(1);
        var newest = reviews.findPublishedStoreReviews(store.getId(), now, null, null, size);
        assertThat(newest.getContent()).extracting(Review::getId).containsExactly(second.getId());
        assertThat(newest.hasNext()).isTrue();
        var older = reviews.findPublishedStoreReviews(store.getId(), now, written, second.getId(), size);
        assertThat(older.getContent()).extracting(Review::getId).containsExactly(first.getId());
        assertThat(older.hasNext()).isFalse();
    }

    private Review storeReview(Store store, Member owner, String title, boolean hidden) {
        return reviews.saveAndFlush(Review.builder().store(store).member(owner).rating(5)
                .title(title).content(title).moderationHidden(hidden).build());
    }
}
