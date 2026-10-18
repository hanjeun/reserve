package kr.it.reserve.feed.service;

import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.file.util.ImageFileValidator;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/** 원본 EXIF/위치/텍스트와 애니메이션을 복사하지 않고 첫 프레임 픽셀만 새 이미지로 저장한다. */
public final class FeedImageNormalizer {
    private FeedImageNormalizer() {}
    public static Normalized inspect(MultipartFile file) {
        if (file != null && file.getSize() > FeedPolicy.MAX_IMAGE_BYTES) {
            throw new FeedException("피드 사진은 한 장당 7MB까지 첨부할 수 있어요.", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        var inspected = ImageFileValidator.inspect(file);
        if (inspected.bytes().length > FeedPolicy.MAX_IMAGE_BYTES) {
            throw new FeedException("피드 사진은 한 장당 7MB까지 첨부할 수 있어요.", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        try {
            BufferedImage source = ImageIO.read(new ByteArrayInputStream(inspected.bytes()));
            if (source == null) throw new FeedException("피드 사진은 JPG·PNG·GIF로 첨부해주세요.", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            boolean png = "image/png".equals(inspected.contentType());
            int orientation = FeedJpegOrientation.read(inspected.bytes());
            boolean rotated = orientation >= 5;
            int width = rotated ? inspected.height() : inspected.width();
            int height = rotated ? inspected.width() : inspected.height();
            BufferedImage safe = new BufferedImage(width, height, png ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
            var graphics = safe.createGraphics();
            try {
                if (!png) { graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, safe.getWidth(), safe.getHeight()); }
                graphics.drawImage(source, FeedJpegOrientation.transform(orientation, source.getWidth(), source.getHeight()), null);
            }
            finally { graphics.dispose(); source.flush(); }
            ByteArrayOutputStream output = new BoundedOutput();
            var writer = ImageIO.getImageWritersByFormatName(png ? "png" : "jpeg").next();
            try (var stream = ImageIO.createImageOutputStream(output)) {
                writer.setOutput(stream); var params = writer.getDefaultWriteParam();
                if (!png) { params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT); params.setCompressionQuality(0.88f); }
                writer.write(null, new javax.imageio.IIOImage(safe, null, null), params);
            } finally { writer.dispose(); safe.flush(); }
            byte[] bytes = output.toByteArray();
            if (bytes.length > ImageFileValidator.MAX_FILE_BYTES) throw new FeedException("사진을 조금 줄여 다시 첨부해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
            return new Normalized(bytes, png ? "image/png" : "image/jpeg", width, height);
        } catch (IOException exception) { throw FeedException.invalid("사진을 처리하지 못했어요. 다른 사진을 선택해주세요."); }
    }
    private static class BoundedOutput extends ByteArrayOutputStream {
        @Override public synchronized void write(byte[] bytes, int offset, int length) {
            if ((long) count + length > ImageFileValidator.MAX_FILE_BYTES) throw new FeedException("사진을 조금 줄여 다시 첨부해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
            super.write(bytes, offset, length);
        }
        @Override public synchronized void write(int value) {
            if (count >= ImageFileValidator.MAX_FILE_BYTES) throw new FeedException("사진을 조금 줄여 다시 첨부해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
            super.write(value);
        }
    }
    public record Normalized(byte[] bytes, String contentType, int width, int height) {
        @Override public String toString() { return "Normalized[byteCount=" + bytes.length + ", width=" + width + ", height=" + height + "]"; }
    }
}
