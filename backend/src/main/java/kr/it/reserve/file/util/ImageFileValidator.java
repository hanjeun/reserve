package kr.it.reserve.file.util;

import kr.it.reserve.global.error.FileException;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Objects;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;

/** 업로드 이미지의 클라이언트 메타데이터가 아니라 실제 바이트를 검사하는 단일 관문. */
public final class ImageFileValidator {

    public static final long MAX_FILE_BYTES = 8L * 1024 * 1024;
    public static final int MAX_DIMENSION = 8_192;
    public static final long MAX_PIXELS = 20_000_000L;

    private static final Map<Format, Set<String>> EXTENSIONS = Map.of(
            Format.JPEG, Set.of(".jpg", ".jpeg"),
            Format.PNG, Set.of(".png"),
            Format.GIF, Set.of(".gif"),
            Format.WEBP, Set.of(".webp"));
    private static final Semaphore DECODE_SLOT = new Semaphore(1, true);

    private ImageFileValidator() {
    }

    public static ValidatedImage inspect(MultipartFile file) {
        byte[] bytes = readBytes(file);
        Format format = detect(bytes);
        validateDeclaredType(file.getContentType(), format);
        validateExtension(file.getOriginalFilename(), format);

        Dimensions dimensions = format == Format.WEBP
                ? inspectWebp(bytes)
                : decodeStandardImage(bytes);
        validateDimensions(dimensions);
        return new ValidatedImage(bytes, format.contentType, format.canonicalExtension,
                dimensions.width, dimensions.height);
    }

    /** 이미 {@link #inspect}를 통과한 호출부의 메타데이터 저장용 경량 재조회. */
    public static int[] readDimensions(MultipartFile file) {
        byte[] bytes = readBytes(file);
        Format format = detect(bytes);
        Dimensions dimensions = format == Format.WEBP
                ? inspectWebp(bytes)
                : readStandardDimensions(bytes);
        validateDimensions(dimensions);
        return new int[]{dimensions.width, dimensions.height};
    }

    private static byte[] readBytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw FileException.invalid("비어 있는 파일은 업로드할 수 없습니다.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new FileException("파일 크기는 8MB를 초과할 수 없습니다.", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        try {
            byte[] bytes = file.getBytes();
            if (bytes.length == 0) {
                throw FileException.invalid("비어 있는 파일은 업로드할 수 없습니다.");
            }
            if (bytes.length > MAX_FILE_BYTES) {
                throw new FileException("파일 크기는 8MB를 초과할 수 없습니다.", HttpStatus.PAYLOAD_TOO_LARGE);
            }
            return bytes;
        } catch (IOException exception) {
            throw FileException.uploadFailed();
        }
    }

    private static Format detect(byte[] bytes) {
        if (startsWith(bytes, 0xff, 0xd8, 0xff)) return Format.JPEG;
        if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return Format.PNG;
        if (asciiEquals(bytes, 0, "GIF87a") || asciiEquals(bytes, 0, "GIF89a")) return Format.GIF;
        if (asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WEBP")) return Format.WEBP;
        throw unsupported("파일 내용이 지원하는 이미지 형식이 아닙니다. (jpg/png/webp/gif)");
    }

    private static void validateDeclaredType(String declaredType, Format format) {
        if (declaredType == null || declaredType.isBlank()) return;
        String normalized = declaredType.toLowerCase(Locale.ROOT);
        if (format == Format.JPEG && "image/jpg".equals(normalized)) return;
        if (!format.contentType.equals(normalized)) {
            throw unsupported("파일의 실제 형식과 콘텐츠 유형이 일치하지 않습니다.");
        }
    }

    private static void validateExtension(String filename, Format format) {
        if (filename == null || !filename.contains(".")) return;
        String extension = filename.substring(filename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
        if (!EXTENSIONS.get(format).contains(extension)) {
            throw unsupported("파일의 실제 형식과 확장자가 일치하지 않습니다.");
        }
    }

    private static Dimensions decodeStandardImage(byte[] bytes) {
        boolean acquired = false;
        try {
            DECODE_SLOT.acquire();
            acquired = true;
            Dimensions header = readStandardDimensions(bytes);
            validateDimensions(header);
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null || image.getWidth() != header.width || image.getHeight() != header.height) {
                throw unsupported("손상되었거나 디코딩할 수 없는 이미지입니다.");
            }
            return header;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw FileException.uploadFailed();
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof FileException fileException) throw fileException;
            throw unsupported("손상되었거나 디코딩할 수 없는 이미지입니다.");
        } finally {
            if (acquired) DECODE_SLOT.release();
        }
    }

    private static Dimensions readStandardDimensions(byte[] bytes) {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw unsupported("디코딩할 수 없는 이미지입니다.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                return new Dimensions(reader.getWidth(0), reader.getHeight(0));
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw unsupported("손상되었거나 디코딩할 수 없는 이미지입니다.");
        }
    }

    /**
     * JDK 기본 ImageIO에 WebP 코덱이 없어 RIFF 전체 chunk 경계와 VP8 계열 헤더를 검사한다.
     * 임의 파일의 확장자만 바꾼 경우와 잘린 RIFF, 비정상 크기는 여기서 거절된다.
     */
    private static Dimensions inspectWebp(byte[] bytes) {
        if (bytes.length < 20 || unsignedIntLe(bytes, 4) + 8L != bytes.length) {
            throw unsupported("손상되었거나 디코딩할 수 없는 WebP 이미지입니다.");
        }

        Dimensions dimensions = null;
        boolean hasImagePayload = false;
        int offset = 12;
        while (offset < bytes.length) {
            if (offset + 8 > bytes.length) throw unsupported("손상된 WebP chunk입니다.");
            String type = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            long chunkSizeLong = unsignedIntLe(bytes, offset + 4);
            if (chunkSizeLong > Integer.MAX_VALUE) throw unsupported("WebP chunk가 너무 큽니다.");
            int chunkSize = (int) chunkSizeLong;
            int data = offset + 8;
            long next = (long) data + chunkSize + (chunkSize & 1);
            if (next > bytes.length) throw unsupported("잘린 WebP chunk입니다.");

            Dimensions chunkDimensions = switch (type) {
                case "VP8X" -> dimensionsVp8x(bytes, data, chunkSize);
                case "VP8L" -> dimensionsVp8l(bytes, data, chunkSize);
                case "VP8 " -> dimensionsVp8(bytes, data, chunkSize);
                case "ANMF" -> dimensionsAnmf(bytes, data, chunkSize);
                default -> null;
            };
            if (chunkDimensions != null && dimensions == null) {
                dimensions = chunkDimensions;
            }
            if ("VP8L".equals(type) || "VP8 ".equals(type) || "ANMF".equals(type)) {
                hasImagePayload = true;
            }
            offset = (int) next;
        }
        if (offset != bytes.length || dimensions == null || !hasImagePayload) {
            throw unsupported("이미지 프레임이 없는 WebP 파일입니다.");
        }
        return dimensions;
    }

    private static Dimensions dimensionsVp8x(byte[] bytes, int data, int size) {
        if (size < 10) throw unsupported("손상된 VP8X 헤더입니다.");
        return new Dimensions(1 + unsigned24Le(bytes, data + 4), 1 + unsigned24Le(bytes, data + 7));
    }

    private static Dimensions dimensionsVp8l(byte[] bytes, int data, int size) {
        if (size < 5 || unsigned(bytes[data]) != 0x2f) throw unsupported("손상된 VP8L 헤더입니다.");
        int b0 = unsigned(bytes[data + 1]);
        int b1 = unsigned(bytes[data + 2]);
        int b2 = unsigned(bytes[data + 3]);
        int b3 = unsigned(bytes[data + 4]);
        int width = 1 + (b0 | ((b1 & 0x3f) << 8));
        int height = 1 + ((b1 >>> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
        return new Dimensions(width, height);
    }

    private static Dimensions dimensionsVp8(byte[] bytes, int data, int size) {
        if (size < 10 || !startsWithAt(bytes, data + 3, 0x9d, 0x01, 0x2a)) {
            throw unsupported("손상된 VP8 헤더입니다.");
        }
        int width = (unsigned(bytes[data + 6]) | (unsigned(bytes[data + 7]) << 8)) & 0x3fff;
        int height = (unsigned(bytes[data + 8]) | (unsigned(bytes[data + 9]) << 8)) & 0x3fff;
        return new Dimensions(width, height);
    }

    private static Dimensions dimensionsAnmf(byte[] bytes, int data, int size) {
        if (size < 24) throw unsupported("손상된 ANMF 프레임입니다.");
        Dimensions frameDimensions = new Dimensions(
                1 + unsigned24Le(bytes, data + 6),
                1 + unsigned24Le(bytes, data + 9));

        boolean hasFramePayload = false;
        int offset = data + 16;
        int end = data + size;
        while (offset < end) {
            if (offset + 8 > end) throw unsupported("손상된 ANMF 하위 chunk입니다.");
            String type = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            long chunkSizeLong = unsignedIntLe(bytes, offset + 4);
            if (chunkSizeLong > Integer.MAX_VALUE) throw unsupported("ANMF 하위 chunk가 너무 큽니다.");
            int chunkSize = (int) chunkSizeLong;
            int payload = offset + 8;
            long next = (long) payload + chunkSize + (chunkSize & 1);
            if (next > end) throw unsupported("잘린 ANMF 하위 chunk입니다.");

            if ("VP8L".equals(type)) {
                dimensionsVp8l(bytes, payload, chunkSize);
                hasFramePayload = true;
            } else if ("VP8 ".equals(type)) {
                dimensionsVp8(bytes, payload, chunkSize);
                hasFramePayload = true;
            }
            offset = (int) next;
        }
        if (offset != end || !hasFramePayload) {
            throw unsupported("이미지 데이터가 없는 ANMF 프레임입니다.");
        }
        return frameDimensions;
    }

    private static void validateDimensions(Dimensions dimensions) {
        if (dimensions.width <= 0 || dimensions.height <= 0
                || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION
                || (long) dimensions.width * dimensions.height > MAX_PIXELS) {
            throw FileException.invalid("이미지 크기는 한 변 8192px, 전체 2천만 픽셀 이하여야 합니다.");
        }
    }

    private static boolean startsWith(byte[] bytes, int... signature) {
        return startsWithAt(bytes, 0, signature);
    }

    private static boolean startsWithAt(byte[] bytes, int offset, int... signature) {
        if (offset < 0 || bytes.length < offset + signature.length) return false;
        for (int i = 0; i < signature.length; i++) {
            if (unsigned(bytes[offset + i]) != signature[i]) return false;
        }
        return true;
    }

    private static boolean asciiEquals(byte[] bytes, int offset, String expected) {
        byte[] signature = expected.getBytes(StandardCharsets.US_ASCII);
        return offset >= 0 && bytes.length >= offset + signature.length
                && Arrays.equals(signature, Arrays.copyOfRange(bytes, offset, offset + signature.length));
    }

    private static int unsigned(byte value) {
        return value & 0xff;
    }

    private static long unsignedIntLe(byte[] bytes, int offset) {
        if (offset < 0 || offset + 4 > bytes.length) throw unsupported("잘린 이미지 헤더입니다.");
        return (long) unsigned(bytes[offset])
                | ((long) unsigned(bytes[offset + 1]) << 8)
                | ((long) unsigned(bytes[offset + 2]) << 16)
                | ((long) unsigned(bytes[offset + 3]) << 24);
    }

    private static int unsigned24Le(byte[] bytes, int offset) {
        if (offset < 0 || offset + 3 > bytes.length) throw unsupported("잘린 이미지 헤더입니다.");
        return unsigned(bytes[offset]) | (unsigned(bytes[offset + 1]) << 8) | (unsigned(bytes[offset + 2]) << 16);
    }

    private static FileException unsupported(String message) {
        return new FileException(message, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    private enum Format {
        JPEG("image/jpeg", ".jpg"),
        PNG("image/png", ".png"),
        GIF("image/gif", ".gif"),
        WEBP("image/webp", ".webp");

        private final String contentType;
        private final String canonicalExtension;

        Format(String contentType, String canonicalExtension) {
            this.contentType = contentType;
            this.canonicalExtension = canonicalExtension;
        }
    }

    private record Dimensions(int width, int height) {
    }

    public record ValidatedImage(
            byte[] bytes,
            String contentType,
            String extension,
            int width,
            int height) {
        @Override
        public boolean equals(Object other) {
            return this == other || other instanceof ValidatedImage(var imageBytes, var imageContentType, var imageExtension, var imageWidth, var imageHeight)
                    && Arrays.equals(bytes, imageBytes)
                    && Objects.equals(contentType, imageContentType)
                    && Objects.equals(extension, imageExtension)
                    && width == imageWidth
                    && height == imageHeight;
        }

        @Override
        public int hashCode() {
            return 31 * Arrays.hashCode(bytes) + Objects.hash(contentType, extension, width, height);
        }

        @Override
        public String toString() {
            return "ValidatedImage[byteCount=" + (bytes == null ? 0 : bytes.length) + ", contentType=" + contentType + ", extension=" + extension + ", width=" + width + ", height=" + height + "]";
        }
    }
}
