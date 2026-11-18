package kr.it.reserve.review.service;

import kr.it.reserve.feed.service.FeedImageCipher;
import kr.it.reserve.feed.service.FeedReviewImageCodec;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
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
import java.util.Optional;
import java.util.function.Predicate;

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
        ImageIO.write(new BufferedImage(360, 600, BufferedImage.TYPE_INT_RGB), "png", png);
        var file = new MockMultipartFile("photos", "fixture.png", "image/png", png.toByteArray());
        String prefix = "users/5/reviews/images";
        String key = prefix + "/fixture.bin";
        when(storage.storeEncryptedReviewImage(any(), any(), eq(prefix))).thenReturn(key);

        photos.update(review, List.of(), List.of(file));

        assertThat(review.getPhotos()).singleElement().satisfies(photo -> {
            assertThat(photo.getWidth()).isEqualTo(360);
            assertThat(photo.getHeight()).isEqualTo(600);
        });
        var written = ArgumentCaptor.forClass(byte[].class);
        var thumbnail = ArgumentCaptor.forClass(byte[].class);
        verify(storage).storeEncryptedReviewImage(written.capture(), thumbnail.capture(), eq(prefix));
        when(storage.readEncryptedReviewThumbnail(eq(key), eq(prefix), any())).thenReturn(thumbnail.getValue());
        byte[] small = photos.read(review.getPhotos().getFirst(), true).bytes();
        verify(storage, never()).readEncryptedReviewImage(any(), any());
        var smallImage = ImageIO.read(new java.io.ByteArrayInputStream(small));
        assertThat(smallImage.getHeight()).isEqualTo(320);
        assertThat(smallImage.getWidth()).isEqualTo(192);
        assertThat(thumbnail.getValue()).isNotEqualTo(small);
        when(storage.readEncryptedReviewImage(key, prefix)).thenReturn(written.getValue());
        byte[] decoded = photos.read(review.getPhotos().getFirst(), false).bytes();
        assertThat(written.getValue()).isNotEqualTo(decoded);
        var image = ImageIO.read(new java.io.ByteArrayInputStream(decoded));
        assertThat(image.getHeight()).isEqualTo(600);
    }

    @Test
    void conditionalPhotoReadChecksPublicationBeforeReturningNotModified() {
        var rows = mock(ReviewRepository.class);
        var service = new ReviewService(rows, mock(ReservationRepository.class), mock(ReviewMutationGuard.class),
                photos, mock(ReviewAuthorReader.class), mock(ReviewInteractions.class));
        Review published = Review.builder().store(Store.builder().build()).member(review.getMember()).build();
        var photo = new ReviewPhoto(published, "users/5/reviews/images/synthetic.bin", "image/png", 180, 300);
        when(rows.findPublishedPhoto(12L, 5L)).thenReturn(Optional.of(photo), Optional.empty());
        Predicate<String> conditional = etag -> etag.endsWith("-thumbnail-v1\"");

        assertThat(service.getPhoto(12L, 5L, true, conditional).image()).isNull();
        assertThatThrownBy(() -> service.getPhoto(12L, 5L, true, conditional))
                .isInstanceOfSatisfying(ReviewException.class,
                        failure -> assertThat(failure.getStatus()).isEqualTo(org.springframework.http.HttpStatus.NOT_FOUND));
        verifyNoInteractions(storage);
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
