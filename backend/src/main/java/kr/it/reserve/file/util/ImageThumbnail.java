package kr.it.reserve.file.util;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

public final class ImageThumbnail {
    private ImageThumbnail() {}

    public static byte[] create(byte[] original, int orientation, int maxSide) {
        return ImageFileValidator.withProcessingSlot(() -> createThumbnail(original, orientation, maxSide));
    }

    private static byte[] createThumbnail(byte[] original, int orientation, int maxSide) {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(original))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw unavailable();
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || Math.max(width, height) > ImageFileValidator.MAX_DIMENSION
                        || (long) width * height > ImageFileValidator.MAX_PIXELS) throw unavailable();
                var params = reader.getDefaultReadParam();
                int step = Math.max(1, Math.max(width, height) / (maxSide * 2));
                params.setSourceSubsampling(step, step, 0, 0);
                BufferedImage source = reader.read(0, params);
                if (source == null) throw unavailable();
                try { return render(source, width, height, orientation, maxSide); }
                finally { source.flush(); }
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException invalid) {
            throw unavailable();
        }
    }

    private static byte[] render(BufferedImage source, int width, int height, int orientation, int maxSide) throws IOException {
        boolean rotated = orientation >= 5;
        double scale = Math.min(1, (double) maxSide / Math.max(width, height));
        int targetWidth = Math.max(1, (int) Math.round((rotated ? height : width) * scale));
        int targetHeight = Math.max(1, (int) Math.round((rotated ? width : height) * scale));
        boolean alpha = source.getColorModel().hasAlpha();
        var small = new BufferedImage(targetWidth, targetHeight, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        try {
            var graphics = small.createGraphics();
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                int sourceWidth = source.getWidth(), sourceHeight = source.getHeight();
                var transform = AffineTransform.getScaleInstance(targetWidth / (double) (rotated ? sourceHeight : sourceWidth),
                        targetHeight / (double) (rotated ? sourceWidth : sourceHeight));
                transform.concatenate(JpegOrientation.transform(orientation, sourceWidth, sourceHeight));
                graphics.drawImage(source, transform, null);
            } finally { graphics.dispose(); }
            return encode(small, alpha);
        } finally { small.flush(); }
    }

    private static byte[] encode(BufferedImage image, boolean alpha) throws IOException {
        var bytes = new ByteArrayOutputStream();
        var writer = ImageIO.getImageWritersByFormatName(alpha ? "png" : "jpeg").next();
        try (var output = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(output);
            var params = writer.getDefaultWriteParam();
            if (!alpha) {
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(0.82f);
            }
            writer.write(null, new IIOImage(image, null, null), params);
            output.flush();
            return bytes.toByteArray();
        } finally { writer.dispose(); }
    }

    private static IllegalArgumentException unavailable() {
        return new IllegalArgumentException("Unable to create an image thumbnail");
    }
}
