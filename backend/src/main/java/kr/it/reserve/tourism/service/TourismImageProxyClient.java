package kr.it.reserve.tourism.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLConnection;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

/**
 * 검증된 한국관광공사 이미지 호스트만 읽는 전용 프록시 클라이언트.
 *
 * <p>결제·OAuth가 공유하는 {@code RestTemplate}과 분리하고, 자동 리다이렉트를 끈 뒤
 * 각 이동 대상을 다시 검증한다. 응답은 스트림으로 읽으며 제한을 넘는 즉시 중단한다.
 */
@Slf4j
@Component
public class TourismImageProxyClient {

    static final int MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final int READ_BUFFER_BYTES = 16 * 1024;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(8);
    private static final Set<Integer> REDIRECT_STATUSES = Set.of(301, 302, 303, 307, 308);
    private static final Set<String> ALLOWED_IMAGE_MEDIA_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif");

    private final ConnectionFactory connectionFactory;

    @Autowired
    public TourismImageProxyClient() {
        this(uri -> {
            URLConnection connection = uri.toURL().openConnection();
            if (connection instanceof HttpsURLConnection httpsConnection) return httpsConnection;
            throw new IOException("Tourism image connection was not HTTPS");
        });
    }

    TourismImageProxyClient(ConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    Optional<FetchedImage> fetch(String imageUrl) {
        if (!isAllowedImageUrl(imageUrl)) return Optional.empty();

        URI current = URI.create(toHttpsImageUrl(imageUrl));
        try {
            for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
                HttpsURLConnection connection = connectionFactory.open(current);
                try {
                    configure(connection);
                    int status = connection.getResponseCode();
                    if (REDIRECT_STATUSES.contains(status)) {
                        if (redirects == MAX_REDIRECTS) return Optional.empty();

                        String location = connection.getHeaderField("Location");
                        if (location == null || location.isBlank()) return Optional.empty();
                        URI redirected = current.resolve(location);
                        if (!isAllowedImageUri(redirected)) return Optional.empty();
                        current = redirected;
                        continue;
                    }

                    if (status < 200 || status >= 300) {
                        closeQuietly(connection.getErrorStream());
                        return Optional.empty();
                    }
                    return readImage(connection);
                } finally {
                    connection.disconnect();
                }
            }
        } catch (Exception exception) {
            log.warn("Tourism image proxy failed: errorType={}", exception.getClass().getSimpleName());
        }
        return Optional.empty();
    }

    private void configure(HttpsURLConnection connection) throws IOException {
        connection.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        connection.setReadTimeout((int) READ_TIMEOUT.toMillis());
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setDoInput(true);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "image/*");
        connection.setRequestProperty("User-Agent", "RESERVE-tourism-image-proxy");
    }

    private Optional<FetchedImage> readImage(HttpsURLConnection connection) throws IOException {
        MediaType contentType = parseMediaType(connection.getContentType())
                .map(TourismImageProxyClient::canonicalImageType)
                .orElse(null);
        if (contentType == null
                || !ALLOWED_IMAGE_MEDIA_TYPES.contains(
                        (contentType.getType() + "/" + contentType.getSubtype()).toLowerCase(Locale.ROOT))) {
            return Optional.empty();
        }

        long contentLength = connection.getContentLengthLong();
        if (contentLength > MAX_IMAGE_BYTES) return Optional.empty();

        int initialCapacity = contentLength >= 0
                ? (int) Math.min(contentLength, READ_BUFFER_BYTES)
                : READ_BUFFER_BYTES;
        try (InputStream input = connection.getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream(initialCapacity)) {
            byte[] buffer = new byte[READ_BUFFER_BYTES];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (total > MAX_IMAGE_BYTES - read) return Optional.empty();
                output.write(buffer, 0, read);
                total += read;
            }
            if (total == 0) return Optional.empty();
            return Optional.of(new FetchedImage(output.toByteArray(), contentType));
        }
    }

    /**
     * 관광공사 API 는 이미지 주소를 http:// 로 준다(2026-09-23 실측 — DB 에 저장된 주소도 전부 http).
     * 같은 호스트가 https 로도 같은 파일을 주므로 visitkorea.or.kr 주소만 https 로 올려서 쓴다.
     * 평문으로는 받지 않는다는 원칙은 그대로다 — 그 밖의 http 주소는 아래 검사에서 계속 거절된다.
     */
    static String toHttpsImageUrl(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        try {
            URI uri = URI.create(trimmed);
            String host = uri.getHost();
            if ("http".equalsIgnoreCase(uri.getScheme()) && host != null) {
                String normalizedHost = host.toLowerCase(Locale.ROOT);
                if ("visitkorea.or.kr".equals(normalizedHost) || normalizedHost.endsWith(".visitkorea.or.kr")) {
                    return "https" + trimmed.substring(trimmed.indexOf(':'));
                }
            }
        } catch (IllegalArgumentException ignored) {
            // 형식이 틀린 주소는 아래 isAllowedImageUrl 이 거절한다.
        }
        return trimmed;
    }

    /** 관광공사 서버는 비표준 image/jpg 로 응답한다(2026-09-23 실측). image/jpeg 와 같은 뜻이라 표준 이름으로 받는다. */
    private static MediaType canonicalImageType(MediaType type) {
        return "image".equalsIgnoreCase(type.getType()) && "jpg".equalsIgnoreCase(type.getSubtype())
                ? MediaType.IMAGE_JPEG
                : type;
    }

    static boolean isAllowedImageUrl(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            return isAllowedImageUri(URI.create(toHttpsImageUrl(value)));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean isAllowedImageUri(URI uri) {
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getUserInfo() != null
                || uri.getPort() != -1
                || uri.getFragment() != null
                || host == null) {
            return false;
        }
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return "visitkorea.or.kr".equals(normalizedHost)
                || normalizedHost.endsWith(".visitkorea.or.kr");
    }

    private static Optional<MediaType> parseMediaType(String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        try {
            return Optional.of(MediaType.parseMediaType(value));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private static void closeQuietly(InputStream input) {
        if (input == null) return;
        try {
            input.close();
        } catch (IOException ignored) {
            // 응답 거부 경로에서 연결 반환을 최선으로 시도한다.
        }
    }

    @FunctionalInterface
    interface ConnectionFactory {
        HttpsURLConnection open(URI uri) throws IOException;
    }

    record FetchedImage(byte[] bytes, MediaType contentType) {
        @Override
        public boolean equals(Object other) {
            return this == other || other instanceof FetchedImage image
                    && Arrays.equals(bytes, image.bytes)
                    && Objects.equals(contentType, image.contentType);
        }

        @Override
        public int hashCode() {
            return 31 * Arrays.hashCode(bytes) + Objects.hash(contentType);
        }

        @Override
        public String toString() {
            return "FetchedImage[byteCount=" + (bytes == null ? 0 : bytes.length) + ", contentType=" + contentType + "]";
        }
    }
}
