package kr.it.reserve.chat.service;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ChatImageThumbnailTest {
    @Test
    void rotatesAShrunkenJpegAndUsesTheOriginalAspectRatio() throws Exception {
        var original = new BufferedImage(1600, 1000, BufferedImage.TYPE_INT_RGB);
        var output = new ByteArrayOutputStream();
        ImageIO.write(original, "jpeg", output);

        var thumbnail = decode(ChatImageThumbnail.create(output.toByteArray(), 6));

        assertThat(thumbnail.getWidth()).isEqualTo(200);
        assertThat(thumbnail.getHeight()).isEqualTo(320);
    }

    @Test
    void doesNotStretchSmallTransparentImages() throws Exception {
        var original = new BufferedImage(40, 30, BufferedImage.TYPE_INT_ARGB);
        original.setRGB(5, 4, Color.BLUE.getRGB());
        var output = new ByteArrayOutputStream();
        ImageIO.write(original, "png", output);

        var thumbnail = decode(ChatImageThumbnail.create(output.toByteArray(), 1));

        assertThat(thumbnail.getColorModel().hasAlpha()).isTrue();
        assertThat(thumbnail.getWidth()).isEqualTo(40);
        assertThat(thumbnail.getHeight()).isEqualTo(30);
        assertThat(thumbnail.getRGB(5, 4)).isEqualTo(Color.BLUE.getRGB());
        assertThat(thumbnail.getRGB(0, 0)).isZero();
    }

    @Test
    void theWebpDecoderProducesARealSmallPreview() throws Exception {
        byte[] webp = Files.readAllBytes(Path.of("../frontend/public/images/discovery-v3/dining-cover.webp"));

        byte[] reduced = ChatImageThumbnail.create(webp, 1);
        var thumbnail = decode(reduced);

        assertThat(Math.max(thumbnail.getWidth(), thumbnail.getHeight())).isEqualTo(320);
        assertThat(reduced.length).isLessThan(webp.length);
    }

    private static BufferedImage decode(byte[] image) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(image));
    }
}
