package kr.it.reserve.file;

import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.FileException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

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

    @ParameterizedTest
    @ValueSource(strings = {"VP8 ", "VP8L"})
    void rejectsOversizedBitstreamBehindSmallWebpCanvas(String type) {
        var file = webp(canvas(1, 1), bitstream(type, 8_193, 1));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("8192px");
        assertThatThrownBy(() -> ImageFileValidator.readDimensions(file))
                .isInstanceOf(FileException.class).hasMessageContaining("8192px");
    }

    @Test
    void rejectsWebpBitstreamThatDisagreesWithCanvas() {
        var file = webp(canvas(2, 2), bitstream("VP8L", 1, 1));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("일치하지");
    }

    @Test
    void rejectsOversizedAnimationFrameBehindSmallWebpCanvas() {
        var file = webp(canvas(1, 1), frame(0, 0, 8_193, 1, bitstream("VP8L", 8_193, 1)));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("8192px");
    }

    @Test
    void rejectsOversizedBitstreamBehindSmallAnimationFrame() {
        var file = webp(canvas(1, 1), frame(0, 0, 1, 1, bitstream("VP8L", 8_193, 1)));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("8192px");
    }

    @Test
    void rejectsAnimationBitstreamThatDisagreesWithFrame() {
        var file = webp(canvas(2, 2), frame(0, 0, 2, 2, bitstream("VP8L", 1, 1)));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("일치하지");
    }

    @Test
    void rejectsAnimationFrameOutsideWebpCanvas() {
        var file = webp(canvas(3, 3), frame(1, 0, 2, 2, bitstream("VP8L", 2, 2)));

        assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                .isInstanceOf(FileException.class).hasMessageContaining("캔버스 범위");
    }

    @Test
    void preservesCanvasDimensionsForSmallerAnimationFrame() {
        var file = webp(canvas(3, 3), frame(1, 1, 1, 1, bitstream("VP8L", 1, 1)));

        var image = ImageFileValidator.inspect(file);

        assertThat(image.width()).isEqualTo(3);
        assertThat(image.height()).isEqualTo(3);
    }

    private MockMultipartFile webp(byte[]... chunks) {
        var body = new ByteArrayOutputStream();
        body.writeBytes("WEBP".getBytes(StandardCharsets.US_ASCII));
        for (byte[] chunk : chunks) body.writeBytes(chunk);
        return new MockMultipartFile("image", "photo.webp", "image/webp", chunk("RIFF", body.toByteArray()));
    }

    private byte[] canvas(int width, int height) {
        byte[] payload = new byte[10];
        littleEndian(payload, 4, width - 1, 3);
        littleEndian(payload, 7, height - 1, 3);
        return chunk("VP8X", payload);
    }

    private byte[] frame(int x, int y, int width, int height, byte[] bitstream) {
        byte[] payload = new byte[16 + bitstream.length];
        littleEndian(payload, 0, x, 3);
        littleEndian(payload, 3, y, 3);
        littleEndian(payload, 6, width - 1, 3);
        littleEndian(payload, 9, height - 1, 3);
        System.arraycopy(bitstream, 0, payload, 16, bitstream.length);
        return chunk("ANMF", payload);
    }

    private byte[] bitstream(String type, int width, int height) {
        if ("VP8L".equals(type)) {
            byte[] payload = new byte[5];
            payload[0] = 0x2f;
            littleEndian(payload, 1, (width - 1) | ((height - 1) << 14), 4);
            return chunk(type, payload);
        }
        byte[] payload = new byte[10];
        payload[3] = (byte) 0x9d;
        payload[4] = 0x01;
        payload[5] = 0x2a;
        littleEndian(payload, 6, width, 2);
        littleEndian(payload, 8, height, 2);
        return chunk(type, payload);
    }

    private byte[] chunk(String type, byte[] payload) {
        byte[] chunk = new byte[8 + payload.length + (payload.length & 1)];
        System.arraycopy(type.getBytes(StandardCharsets.US_ASCII), 0, chunk, 0, 4);
        littleEndian(chunk, 4, payload.length, 4);
        System.arraycopy(payload, 0, chunk, 8, payload.length);
        return chunk;
    }

    private void littleEndian(byte[] bytes, int offset, int value, int length) {
        for (int index = 0; index < length; index++) bytes[offset + index] = (byte) (value >>> (index * 8));
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
