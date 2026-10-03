package kr.it.reserve.tourism.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TourismImageProxyClientTest {

    private static final String IMAGE_URL =
            "https://tong.visitkorea.or.kr/cms/resource/00/123456_image2_1.jpg";

    @Mock private TourismImageProxyClient.ConnectionFactory connectionFactory;
    @Mock private HttpsURLConnection firstConnection;
    @Mock private HttpsURLConnection secondConnection;

    @Test
    void acceptsAnAllowedHttpsImageAndStreamsItsBytes() throws Exception {
        byte[] bytes = {1, 2, 3, 4};
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        successfulImage(firstConnection, "image/jpeg", bytes.length, new ByteArrayInputStream(bytes));

        var result = new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL);

        assertThat(result).hasValueSatisfying(image -> {
            assertThat(image.bytes()).containsExactly(bytes);
            assertThat(image.contentType()).hasToString("image/jpeg");
        });
        verify(firstConnection).setInstanceFollowRedirects(false);
        verify(firstConnection).setConnectTimeout(3_000);
        verify(firstConnection).setReadTimeout(8_000);
        verify(firstConnection).disconnect();
    }

    @Test
    void followsOnlyABoundedValidatedVisitKoreaRedirect() throws Exception {
        URI redirected = URI.create("https://cdn.visitkorea.or.kr/images/redirected.jpg");
        byte[] bytes = {7, 8, 9};
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(302);
        when(firstConnection.getHeaderField("Location")).thenReturn(redirected.toString());
        when(connectionFactory.open(redirected)).thenReturn(secondConnection);
        successfulImage(secondConnection, "image/png", -1, new ByteArrayInputStream(bytes));

        var result = new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL);

        assertThat(result).hasValueSatisfying(image -> assertThat(image.bytes()).containsExactly(bytes));
        verify(firstConnection).disconnect();
        verify(secondConnection).disconnect();
    }

    @Test
    void upgradesVisitKoreaHttpImagesToHttpsInsteadOfFetchingPlaintext() throws Exception {
        byte[] bytes = {5, 6, 7};
        when(connectionFactory.open(URI.create("https://tong.visitkorea.or.kr/image.jpg"))).thenReturn(firstConnection);
        successfulImage(firstConnection, "image/jpeg", bytes.length, new ByteArrayInputStream(bytes));

        var result = new TourismImageProxyClient(connectionFactory).fetch("http://tong.visitkorea.or.kr/image.jpg");

        assertThat(result).hasValueSatisfying(image -> assertThat(image.bytes()).containsExactly(bytes));
        verify(connectionFactory).open(URI.create("https://tong.visitkorea.or.kr/image.jpg"));
        assertThat(TourismImageProxyClient.isAllowedImageUrl("http://tong.visitkorea.or.kr/image.jpg")).isTrue();
    }

    @Test
    void rejectsHttpOutsideVisitKoreaBeforeOpeningAConnection() {
        assertThat(new TourismImageProxyClient(connectionFactory)
                .fetch("http://example.com/image.jpg")).isEmpty();
        assertThat(TourismImageProxyClient.isAllowedImageUrl("http://tong.visitkorea.or.kr:8080/image.jpg")).isFalse();

        verifyNoInteractions(connectionFactory);
    }

    @Test
    void acceptsTheNonStandardImageJpgTypeAsJpeg() throws Exception {
        byte[] bytes = {1, 2};
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        successfulImage(firstConnection, "image/jpg", bytes.length, new ByteArrayInputStream(bytes));

        var result = new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL);

        assertThat(result).hasValueSatisfying(image -> assertThat(image.contentType()).hasToString("image/jpeg"));
    }

    @Test
    void rejectsARedirectToAnExternalHost() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(302);
        when(firstConnection.getHeaderField("Location")).thenReturn("https://example.invalid/image.jpg");

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(connectionFactory).open(URI.create(IMAGE_URL));
        verify(connectionFactory, never()).open(URI.create("https://example.invalid/image.jpg"));
        verify(firstConnection).disconnect();
    }

    @Test
    void stopsAfterThreeAllowedRedirects() throws Exception {
        when(connectionFactory.open(any(URI.class))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(302);
        when(firstConnection.getHeaderField("Location"))
                .thenReturn("https://cdn.visitkorea.or.kr/images/next.jpg");

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(connectionFactory, times(4)).open(any(URI.class));
        verify(firstConnection, times(4)).disconnect();
    }

    @Test
    void rejectsANonImageMimeTypeWithoutReadingTheBody() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(200);
        when(firstConnection.getContentType()).thenReturn("text/html; charset=utf-8");

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(firstConnection, never()).getInputStream();
        verify(firstConnection).disconnect();
    }

    @Test
    void rejectsSvgEvenThoughItsTopLevelMimeTypeIsImage() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(200);
        when(firstConnection.getContentType()).thenReturn("image/svg+xml");

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(firstConnection, never()).getInputStream();
        verify(firstConnection).disconnect();
    }

    @Test
    void stopsStreamingAsSoonAsTheEightMiBLimitIsExceeded() throws Exception {
        CountingInputStream body = new CountingInputStream(TourismImageProxyClient.MAX_IMAGE_BYTES + 1);
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        successfulImage(firstConnection, "image/jpeg", -1, body);

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();
        assertThat(body.bytesRead()).isEqualTo(TourismImageProxyClient.MAX_IMAGE_BYTES + 1);
        assertThat(body.closed()).isTrue();
        verify(firstConnection).disconnect();
    }

    @Test
    void rejectsADeclaredOversizedBodyWithoutOpeningItsStream() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenReturn(200);
        when(firstConnection.getContentType()).thenReturn("image/jpeg");
        when(firstConnection.getContentLengthLong())
                .thenReturn((long) TourismImageProxyClient.MAX_IMAGE_BYTES + 1);

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(firstConnection, never()).getInputStream();
        verify(firstConnection).disconnect();
    }

    @Test
    void returnsEmptyWhenTheDedicatedRequestTimesOut() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenReturn(firstConnection);
        when(firstConnection.getResponseCode()).thenThrow(new SocketTimeoutException("timed out"));

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();

        verify(firstConnection).disconnect();
    }

    @Test
    void returnsEmptyWhenOpeningTheDedicatedConnectionFails() throws Exception {
        when(connectionFactory.open(URI.create(IMAGE_URL))).thenThrow(new IOException("unavailable"));

        assertThat(new TourismImageProxyClient(connectionFactory).fetch(IMAGE_URL)).isEmpty();
    }

    private static void successfulImage(
            HttpsURLConnection connection, String contentType, long contentLength, InputStream body)
            throws IOException {
        when(connection.getResponseCode()).thenReturn(200);
        when(connection.getContentType()).thenReturn(contentType);
        when(connection.getContentLengthLong()).thenReturn(contentLength);
        when(connection.getInputStream()).thenReturn(body);
    }

    private static final class CountingInputStream extends InputStream {
        private int remaining;
        private int bytesRead;
        private boolean closed;

        private CountingInputStream(int size) {
            this.remaining = size;
        }

        @Override
        public int read() {
            if (remaining == 0) return -1;
            remaining--;
            bytesRead++;
            return 0;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) {
            if (remaining == 0) return -1;
            int read = Math.min(length, remaining);
            remaining -= read;
            bytesRead += read;
            return read;
        }

        @Override
        public void close() throws IOException {
            closed = true;
            super.close();
        }

        private int bytesRead() {
            return bytesRead;
        }

        private boolean closed() {
            return closed;
        }
    }
}
