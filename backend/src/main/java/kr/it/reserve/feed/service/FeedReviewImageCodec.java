package kr.it.reserve.feed.service;

import kr.it.reserve.review.service.ReviewImageCodec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
@RequiredArgsConstructor
public class FeedReviewImageCodec implements ReviewImageCodec {
    private final FeedImageCipher cipher;

    @Override public boolean isEnabled() { return cipher.isEnabled(); }
    @Override public byte[] encrypt(byte[] bytes, String context) { return cipher.encrypt(bytes, context); }
    @Override public byte[] decrypt(byte[] bytes, String context) { return cipher.decrypt(bytes, context); }

    @Override
    public NormalizedImage inspect(MultipartFile file) {
        var image = FeedImageNormalizer.inspect(file);
        return new NormalizedImage(image.bytes(), image.contentType(), image.width(), image.height());
    }
}
