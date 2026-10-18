package kr.it.reserve.config.oauth2.events;

import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** 오류 본문·리다이렉트·제한 초과 본문을 drain하지 않는 공급자 메타데이터 전용 클라이언트. */
@Component
public class OAuthSecurityEventMetadataClient {
    private static final Set<String> ALLOWED_URLS = Set.of(
            "https://accounts.google.com/.well-known/risc-configuration",
            "https://www.googleapis.com/oauth2/v3/certs",
            "https://kauth.kakao.com/.well-known/ssf-configuration",
            "https://kauth.kakao.com/.well-known/jwks.json");
    private final ConnectionFactory connections;

    public OAuthSecurityEventMetadataClient() {
        this(uri -> (HttpURLConnection) uri.toURL().openConnection());
    }

    OAuthSecurityEventMetadataClient(ConnectionFactory connections) { this.connections = connections; }

    public String read(String url, int maximumBytes) {
        if (!ALLOWED_URLS.contains(url) || maximumBytes < 1 || maximumBytes > 262_144) {
            throw OAuthSecurityEventException.unavailable();
        }
        HttpURLConnection connection = null;
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        try {
            connection = connections.open(URI.create(url));
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(500);
            connection.setReadTimeout(500);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Connection", "close");
            int status = connection.getResponseCode();
            if (status != 200 || connection.getContentLengthLong() > maximumBytes) {
                throw OAuthSecurityEventException.unavailable();
            }
            InputStream input = connection.getInputStream();
            ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maximumBytes, 8192));
            byte[] buffer = new byte[Math.min(maximumBytes + 1, 8192)];
            while (output.size() <= maximumBytes) {
                if (System.nanoTime() >= deadline) throw OAuthSecurityEventException.unavailable();
                int count = input.read(buffer, 0, Math.min(buffer.length, maximumBytes + 1 - output.size()));
                if (count < 0) return output.toString(StandardCharsets.UTF_8);
                output.write(buffer, 0, count);
            }
            throw OAuthSecurityEventException.unavailable();
        } catch (IOException exception) {
            throw OAuthSecurityEventException.unavailable();
        } finally {
            // 부분 응답을 close해서 재사용을 위해 drain하지 않는다. 활성 연결을 직접 폐기한다.
            if (connection != null) connection.disconnect();
        }
    }

    @FunctionalInterface
    interface ConnectionFactory { HttpURLConnection open(URI uri) throws IOException; }
}
