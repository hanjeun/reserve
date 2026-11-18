package kr.it.reserve.review.service;

import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class ReviewPhotos {
    private static final int MAX_PHOTOS = 5;
    private static final long MAX_UPLOAD_BYTES = 7L * 1024 * 1024;
    private static final Set<String> CONTENT_TYPES = Set.of("image/jpeg", "image/png");

    private final ReviewImageCodec codec;
    private final FileStorageService storage;
    private final FileDeletionOutboxService deletions;
    private final Semaphore transfers = new Semaphore(2, true);

    void update(Review review, List<Long> removedIds, List<MultipartFile> files) {
        if (files.isEmpty() && removedIds.isEmpty()) return;
        var existing = review.getPhotos();
        if (removedIds.size() > MAX_PHOTOS) {
            throw new ReviewException("사진 목록이 변경됐어요. 다시 불러와주세요.", HttpStatus.CONFLICT);
        }
        Set<Long> ids = new HashSet<>(removedIds);
        if (ids.size() != removedIds.size() || ids.contains(null)
                || !existing.stream().map(ReviewPhoto::getId).toList().containsAll(ids)) {
            throw new ReviewException("사진 목록이 변경됐어요. 다시 불러와주세요.", HttpStatus.CONFLICT);
        }
        if (existing.size() - ids.size() + files.size() > MAX_PHOTOS) {
            throw new ReviewException("리뷰에는 사진을 최대 5장 첨부할 수 있어요.", HttpStatus.BAD_REQUEST);
        }
        if (files.stream().mapToLong(MultipartFile::getSize).sum() > MAX_UPLOAD_BYTES) {
            throw new ReviewException("첨부 사진을 합계 7MB 이하로 선택해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        if (files.stream().anyMatch(file -> file.isEmpty() || file.getContentType() == null || !CONTENT_TYPES.contains(file.getContentType()))) {
            throw new ReviewException("리뷰 사진은 JPG 또는 PNG로 첨부해주세요.", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }

        if (!ids.isEmpty()) {
            var removed = existing.stream().filter(photo -> ids.contains(photo.getId())).toList();
            enqueueDeletion(removed, review.getId());
            existing.removeAll(removed);
        }
        if (files.isEmpty()) return;
        requireKey();
        String prefix = FileStoragePaths.reviewImage(review.getMember().getId());
        for (MultipartFile file : files) {
            ReviewPhoto photo = transfer(() -> {
                var image = codec.inspect(file);
                String key = storage.storeEncryptedReviewImage(codec.encrypt(image.bytes(), prefix), prefix);
                return new ReviewPhoto(review, key, image.contentType(), image.width(), image.height());
            });
            existing.add(photo);
        }
    }

    public void enqueueDeletion(List<ReviewPhoto> photos, Long reviewId) {
        for (ReviewPhoto photo : photos) deletions.enqueue(photo.getObjectKey(), "REVIEW_PHOTO", reviewId);
    }

    ImageContent read(ReviewPhoto photo) {
        requireKey();
        String prefix = FileStoragePaths.reviewImage(photo.getReview().getMember().getId());
        return transfer(() -> new ImageContent(
                codec.decrypt(storage.readEncryptedReviewImage(photo.getObjectKey(), prefix), prefix), photo.getContentType()));
    }

    private void requireKey() {
        if (!codec.isEnabled()) throw new ReviewException("리뷰 사진을 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }

    private <T> T transfer(Supplier<T> action) {
        try {
            if (!transfers.tryAcquire(5, TimeUnit.SECONDS)) {
                throw new ReviewException("잠시 후 사진을 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ReviewException("사진 요청이 중단됐어요. 다시 시도해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        try { return action.get(); }
        finally { transfers.release(); }
    }

    public record ImageContent(byte[] bytes, String contentType) { }
}
