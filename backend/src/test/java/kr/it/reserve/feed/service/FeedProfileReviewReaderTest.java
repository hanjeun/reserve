package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FeedProfileReviewReaderTest {
    @Test
    void profileReviewPortKeepsPageMetadataAndTheExistingPublicPhotoJson() throws Exception {
        var repository = mock(ReviewRepository.class);
        var reader = new FeedProfileReviewReader(repository);
        var now = LocalDateTime.of(2026, 11, 18, 1, 0);
        var page = PageRequest.of(1, 2);
        var store = Store.builder().id(20L).publicId("synthetic-store").name("합성 가게").build();
        var review = Review.builder().id(30L).store(store).rating(5).title("합성 리뷰")
                .content("사진이 있는 합성 리뷰예요.").createdAt(now).build();
        var photo = new ReviewPhoto(review, "synthetic-private-object.bin", "image/png", 180, 320);
        ReflectionTestUtils.setField(photo, "id", 40L);
        review.getPhotos().add(photo);
        when(repository.findPublishedProfileReviews(7L, false, now, page))
                .thenReturn(new PageImpl<>(List.of(review), page, 7));

        var result = reader.findPublished(7L, false, now, page);

        assertThat(result.getTotalElements()).isEqualTo(7);
        assertThat(result.getTotalPages()).isEqualTo(4);
        assertThat(result.getNumber()).isEqualTo(1);
        assertThat(result.getSize()).isEqualTo(2);
        var item = result.getContent().getFirst();
        assertThat(item.id()).isEqualTo(review.getId());
        assertThat(item.storePublicId()).isEqualTo(store.getPublicId());
        assertThat(item.storeName()).isEqualTo(store.getName());
        assertThat(item.createdAt()).isEqualTo(now.atOffset(ZoneOffset.UTC));
        var mapper = new ObjectMapper();
        String photoJson = mapper.writeValueAsString(item.photos().getFirst());
        assertThat(photoJson).isEqualTo(mapper.writeValueAsString(ReviewResponse.photoList(review).getFirst()));
        assertThat(photoJson).isEqualTo("{\"id\":40,\"url\":\"/api/reviews/30/photos/40\",\"width\":180,\"height\":320,"
                + "\"thumbnailUrl\":\"/api/reviews/30/photos/40?size=thumbnail\"}");
        verify(repository).findPublishedProfileReviews(7L, false, now, page);
    }
}
