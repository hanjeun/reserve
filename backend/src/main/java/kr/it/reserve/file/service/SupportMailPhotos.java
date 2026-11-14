package kr.it.reserve.file.service;

import kr.it.reserve.file.entity.SupportMailPhoto;
import kr.it.reserve.file.repository.SupportMailPhotoRepository;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import kr.it.reserve.global.error.FileException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SupportMailPhotos {
    public static final int MAX_PHOTOS = 3;
    public static final int MAX_PHOTO_BYTES = 2 * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private final SupportMailPhotoRepository photos;

    public static List<ValidatedImage> validateUploads(List<MultipartFile> uploads) {
        if (uploads == null || uploads.isEmpty()) return List.of();
        if (uploads.size() > MAX_PHOTOS) throw FileException.invalid("사진은 최대 3장까지 첨부할 수 있어요.");
        List<ValidatedImage> result = new ArrayList<>(uploads.size());
        for (MultipartFile upload : uploads) {
            if (upload.getSize() > MAX_PHOTO_BYTES) {
                throw new FileException("사진은 한 장당 2MB 이하로 첨부해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
            }
            ValidatedImage photo = ImageFileValidator.inspect(upload);
            if (!supportedType(photo.contentType())) {
                throw FileException.invalid("JPG, PNG, WebP 사진을 첨부해주세요.");
            }
            result.add(photo);
        }
        return result;
    }

    public static boolean supportedType(String contentType) {
        return contentType != null && TYPES.contains(contentType.toLowerCase(Locale.ROOT));
    }

    public static String filename(ValidatedImage image, int number) {
        return "photo-" + number + image.extension();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void saveInquiry(Long inquiryId, List<ValidatedImage> images) {
        save(inquiryId, null, images);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void saveSent(Long sentMailId, List<ValidatedImage> images) {
        save(null, sentMailId, images);
    }

    private void save(Long inquiryId, Long sentMailId, List<ValidatedImage> images) {
        for (int i = 0; i < images.size(); i++) {
            ValidatedImage image = images.get(i);
            photos.save(new SupportMailPhoto(inquiryId, sentMailId, filename(image, i + 1),
                    image.contentType(), image.bytes()));
        }
    }

    public List<Long> inquiryIds(Long inquiryId) {
        return photos.findInquiryPhotoIds(inquiryId);
    }

    public List<Long> sentIds(Long sentMailId) {
        return photos.findSentPhotoIds(sentMailId);
    }

    public ResponseEntity<byte[]> inquiryPhoto(Long inquiryId, Long photoId) {
        return response(photos.findByIdAndInquiryId(photoId, inquiryId).orElseThrow(SupportMailPhotos::notFound));
    }

    public ResponseEntity<byte[]> sentPhoto(Long sentMailId, Long photoId) {
        return response(photos.findByIdAndSentMailId(photoId, sentMailId).orElseThrow(SupportMailPhotos::notFound));
    }

    private static ResponseEntity<byte[]> response(SupportMailPhoto photo) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(photo.getFilename()).build().toString())
                .contentType(MediaType.parseMediaType(photo.getContentType()))
                .body(photo.getContent());
    }

    private static FileException notFound() {
        return new FileException("첨부 사진을 찾을 수 없어요.", HttpStatus.NOT_FOUND);
    }
}
