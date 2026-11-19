package kr.it.reserve.feed.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FeedReviewImageCodecTest {
    @Test
    void reviewCodecKeepsTheExistingNormalizationAndEncryptedStorageFormat() throws Exception {
        var cipher = new FeedImageCipher(Base64.getEncoder().encodeToString(new byte[32]));
        var codec = new FeedReviewImageCodec(cipher);
        var source = new ByteArrayOutputStream();
        var pixels = new BufferedImage(60, 100, BufferedImage.TYPE_INT_RGB);
        try { ImageIO.write(pixels, "png", source); }
        finally { pixels.flush(); }
        var file = new MockMultipartFile("photos", "synthetic.png", "image/png", source.toByteArray());
        String context = "users/7/reviews/images";

        var image = codec.inspect(file);

        assertThat(codec.isEnabled()).isTrue();
        assertThat(image.contentType()).isEqualTo("image/png");
        assertThat(image.width()).isEqualTo(60);
        assertThat(image.height()).isEqualTo(100);
        byte[] existingFile = cipher.encrypt(image.bytes(), context);
        assertThat(codec.decrypt(existingFile, context)).isEqualTo(image.bytes());
        assertThat(cipher.decrypt(codec.encrypt(image.bytes(), context), context)).isEqualTo(image.bytes());
        assertThatThrownBy(() -> codec.decrypt(existingFile, "users/8/reviews/images"))
                .isInstanceOf(IllegalStateException.class).hasMessage("Feed image authentication failed");
    }
}
