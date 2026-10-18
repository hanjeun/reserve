package kr.it.reserve.config.oauth2.events;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthSecurityEventMetadataClientTest {
    private static final String DISCOVERY = "https://accounts.google.com/.well-known/risc-configuration";

    @Test
    void unknownLengthBodyStopsAtTheLimitAndDisconnectsWithoutDrainingOrClosingTheStream() throws Exception {
        AtomicInteger read = new AtomicInteger();
        AtomicBoolean disconnected = new AtomicBoolean();
        HttpURLConnection connection = connection(200, new InputStream() {
            @Override public int read() { read.incrementAndGet(); return 'x'; }
            @Override public void close() { throw new AssertionError("Partial body must not be drained by close"); }
        }, disconnected);
        OAuthSecurityEventMetadataClient client = new OAuthSecurityEventMetadataClient(uri -> connection);

        assertThatThrownBy(() -> client.read(DISCOVERY, 32_768))
                .isInstanceOf(OAuthSecurityEventException.class).hasMessage("temporarily_unavailable");
        assertThat(read).hasValue(32_769);
        assertThat(disconnected).isTrue();
        assertThat(connection.getInstanceFollowRedirects()).isFalse();
        assertThat(connection.getConnectTimeout()).isEqualTo(500);
        assertThat(connection.getReadTimeout()).isEqualTo(500);
    }

    @Test
    void errorResponseBodyIsNeverReadAndRedirectsAreNotFollowed() throws Exception {
        for (int status : new int[] {302, 400, 500}) {
            AtomicBoolean disconnected = new AtomicBoolean();
            HttpURLConnection connection = connection(status, new InputStream() {
                @Override public int read() { throw new AssertionError("Error body must not be read"); }
            }, disconnected);
            OAuthSecurityEventMetadataClient client = new OAuthSecurityEventMetadataClient(uri -> connection);

            assertThatThrownBy(() -> client.read(DISCOVERY, 32_768))
                    .isInstanceOf(OAuthSecurityEventException.class);
            assertThat(disconnected).isTrue();
        }
    }

    private HttpURLConnection connection(int status, InputStream input, AtomicBoolean disconnected) throws Exception {
        return new HttpURLConnection(new URL(DISCOVERY)) {
            @Override public int getResponseCode() { return status; }
            @Override public long getContentLengthLong() { return -1; }
            @Override public InputStream getInputStream() { return input; }
            @Override public InputStream getErrorStream() { throw new AssertionError("Error body must not be read"); }
            @Override public void disconnect() { disconnected.set(true); }
            @Override public boolean usingProxy() { return false; }
            @Override public void connect() { }
        };
    }
}
