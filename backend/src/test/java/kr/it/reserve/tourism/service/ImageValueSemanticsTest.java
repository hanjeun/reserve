package kr.it.reserve.tourism.service;

import kr.it.reserve.chat.service.ChatImageService.ImageContent;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ImageValueSemanticsTest {
    private List<Object> images(byte[] bytes) {
        return List.of(new ImageContent(bytes, "image/png"),
                new ValidatedImage(bytes, "image/png", "png", 1, 2),
                new TourismImageProxyClient.FetchedImage(bytes, MediaType.IMAGE_PNG),
                new TourismRegionPhotoService.ImagePayload(bytes, MediaType.IMAGE_PNG));
    }

    @Test
    void equalImageContentsHaveTheSameHashWithoutLoggingImageBytes() {
        var original = images(new byte[]{42, 43});
        var sameContents = images(new byte[]{42, 43});
        var differentContents = images(new byte[]{43, 42});
        for (int i = 0; i < original.size(); i++) {
            Object image = original.get(i);
            assertThat(image).isEqualTo(image).isEqualTo(sameContents.get(i))
                    .isNotEqualTo(differentContents.get(i)).isNotEqualTo(null).isNotEqualTo("image");
            assertThat(image.hashCode()).isEqualTo(sameContents.get(i).hashCode());
            assertThat(image.toString()).contains("byteCount=2").doesNotContain("[42, 43]", "[B@");
        }
    }
}
