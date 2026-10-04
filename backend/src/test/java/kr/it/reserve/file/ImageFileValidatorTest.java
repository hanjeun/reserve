package kr.it.reserve.file;

import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.FileException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageFileValidatorTest {

    @Test
    void acceptsDecodedImageAndUsesItsActualMetadata() throws Exception {
        MockMultipartFile file = png("photo.png", "image/png", 12, 7);

        ImageFileValidator.ValidatedImage image = ImageFileValidator.inspect(file);

        assertThat(image.contentType()).isEqualTo("image/png");
        assertThat(image.extension()).isEqualTo(".png");
        assertThat(image.width()).isEqualTo(12);
        assertThat(image.height()).isEqualTo(7);
        assertThat(image.bytes()).isEqualTo(file.getBytes());
    }

    @Test
    void rejectsAClientMimeTypeThatDisagreesWithTheBytes() {
        MockMultipartFile file = png("photo.jpg", "image/jpeg", 2, 2);

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class)
                .hasMessageContaining("실제 형식");
    }

    @Test
    void rejectsMagicBytesWithoutADecodableImage() {
        MockMultipartFile file = new MockMultipartFile(
                "image", "broken.png", "image/png",
                new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3});

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class)
                .hasMessageContaining("디코딩");
    }

    @Test
    void rejectsWebpCanvasHeaderWithoutAnImageFrame() {
        byte[] vp8xOnly = new byte[]{
                'R', 'I', 'F', 'F', 22, 0, 0, 0,
                'W', 'E', 'B', 'P',
                'V', 'P', '8', 'X', 10, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        };
        MockMultipartFile file = new MockMultipartFile(
                "image", "canvas-only.webp", "image/webp", vp8xOnly);

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class)
                .hasMessageContaining("이미지 프레임");
    }

    private MockMultipartFile png(String filename, String contentType, int width, int height) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output);
            return new MockMultipartFile("image", filename, contentType, output.toByteArray());
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
