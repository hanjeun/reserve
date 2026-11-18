package kr.it.reserve.review.service;

import kr.it.reserve.feed.service.FeedImageCipher;
import kr.it.reserve.feed.service.FeedReviewImageCodec;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReviewPhotosTest {
    private final FeedImageCipher cipher = new FeedImageCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final FileStorageService storage = mock(FileStorageService.class);
    private final FileDeletionOutboxService deletions = mock(FileDeletionOutboxService.class);
    private final ReviewPhotos photos = new ReviewPhotos(new FeedReviewImageCodec(cipher), storage, deletions);
    private final Review review = Review.builder().id(12L).member(Member.builder().id(5L).build()).build();

    @Test
    void photoKeepsItsRatioAndUsesEncryptedReviewStorage() throws IOException {
        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(90, 150, BufferedImage.TYPE_INT_RGB), "png", png);
        var file = new MockMultipartFile("photos", "fixture.png", "image/png", png.toByteArray());
        String prefix = "users/5/reviews/images";
        String key = prefix + "/fixture.bin";
        when(storage.storeEncryptedReviewImage(any(), eq(prefix))).thenReturn(key);

        photos.update(review, List.of(), List.of(file));

        assertThat(review.getPhotos()).singleElement().satisfies(photo -> {
            assertThat(photo.getWidth()).isEqualTo(90);
            assertThat(photo.getHeight()).isEqualTo(150);
        });
        var written = ArgumentCaptor.forClass(byte[].class);
        verify(storage).storeEncryptedReviewImage(written.capture(), eq(prefix));
        when(storage.readEncryptedReviewImage(key, prefix)).thenReturn(written.getValue());
        byte[] decoded = photos.read(review.getPhotos().getFirst()).bytes();
        assertThat(written.getValue()).isNotEqualTo(decoded);
        var image = ImageIO.read(new java.io.ByteArrayInputStream(decoded));
        assertThat(image.getHeight()).isEqualTo(150);
    }

    @Test
    void countSizeAndForeignRemovalsAreRejectedBeforeWriting() {
        MultipartFile file = mock(MultipartFile.class);
        assertThatThrownBy(() -> photos.update(review, List.of(), Collections.nCopies(6, file)))
                .isInstanceOf(ReviewException.class).hasMessageContaining("최대 5장");
        when(file.getSize()).thenReturn(4L * 1024 * 1024);
        assertThatThrownBy(() -> photos.update(review, List.of(), List.of(file, file)))
                .isInstanceOf(ReviewException.class).hasMessageContaining("합계 7MB");
        assertThatThrownBy(() -> photos.update(review, List.of(99L), List.of()))
                .isInstanceOf(ReviewException.class).hasMessageContaining("사진 목록이 변경됐어요");
        verifyNoInteractions(storage, deletions);
    }

    @Test
    void removesOnlyExplicitPhotosAndQueuesTheirFiles() {
        ReviewPhoto removed = storedPhoto(2L, "removed.bin");
        ReviewPhoto kept = storedPhoto(3L, "kept.bin");
        photos.update(review, List.of(2L), List.of());
        assertThat(review.getPhotos()).containsExactly(kept);
        verify(deletions).enqueue(removed.getObjectKey(), "REVIEW_PHOTO", 12L);
        verifyNoMoreInteractions(deletions);
    }

    @Test
    void aDisabledCodecIsRejectedBeforeNormalizationOrStorage() {
        var codec = mock(ReviewImageCodec.class);
        var unavailable = new ReviewPhotos(codec, storage, deletions);
        var file = new MockMultipartFile("photos", "synthetic.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> unavailable.update(review, List.of(), List.of(file)))
                .isInstanceOfSatisfying(ReviewException.class,
                        error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));
        verify(codec).isEnabled();
        verifyNoMoreInteractions(codec);
        verifyNoInteractions(storage, deletions);
    }

    private ReviewPhoto storedPhoto(Long id, String key) {
        var photo = new ReviewPhoto(review, "users/5/reviews/images/" + key, "image/png", 25, 40);
        ReflectionTestUtils.setField(photo, "id", id);
        review.getPhotos().add(photo);
        return photo;
    }
}
