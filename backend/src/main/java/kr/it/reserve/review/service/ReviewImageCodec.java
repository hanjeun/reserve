package kr.it.reserve.review.service;

import org.springframework.web.multipart.MultipartFile;

public interface ReviewImageCodec {
    boolean isEnabled();
    byte[] encrypt(byte[] bytes, String context);
    byte[] decrypt(byte[] bytes, String context);
    NormalizedImage inspect(MultipartFile file);

    record NormalizedImage(byte[] bytes, String contentType, int width, int height) {
        @Override public String toString() {
            return "NormalizedImage[byteCount=" + bytes.length + ", width=" + width + ", height=" + height + "]";
        }
    }
}
