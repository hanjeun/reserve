package kr.it.reserve.feed.service;

import kr.it.reserve.file.util.ImageFileValidator;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockStatic;

@Timeout(20)
class FeedImageProcessingTest {
    @ParameterizedTest
    @ValueSource(strings = {"decode", "encode"})
    void normalizationKeepsTheGlobalSlotThroughItsSecondDecodeAndEncoding(String phase) throws Exception {
        var output = new ByteArrayOutputStream();
        var pixels = new BufferedImage(8, 6, BufferedImage.TYPE_INT_ARGB);
        try { ImageIO.write(pixels, "png", output); }
        finally { pixels.flush(); }
        byte[] bytes = output.toByteArray();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var probeStarted = new CountDownLatch(1);
        var probeRead = new CountDownLatch(1);
        var reads = new AtomicInteger();
        var file = new MockMultipartFile("image", "test.png", "image/png", bytes);
        var probe = new MockMultipartFile("image", "probe.png", "image/png", bytes) {
            @Override public byte[] getBytes() { probeRead.countDown(); return bytes; }
        };
        var executor = Executors.newFixedThreadPool(2);
        try {
            var processing = executor.submit(() -> {
                try (var imageIo = mockStatic(ImageIO.class, invocation -> {
                    boolean decode = invocation.getMethod().getName().equals("read")
                            && invocation.getMethod().getParameterTypes()[0] == InputStream.class
                            && reads.incrementAndGet() == 2;
                    boolean encode = invocation.getMethod().getName().equals("createImageOutputStream");
                    if (phase.equals("decode") && decode || phase.equals("encode") && encode) {
                        entered.countDown();
                        if (!release.await(10, TimeUnit.SECONDS)) throw new AssertionError("Synthetic processing phase was not released");
                    }
                    return invocation.callRealMethod();
                })) {
                    return FeedImageNormalizer.inspect(file);
                }
            });
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            var waiting = executor.submit(() -> {
                probeStarted.countDown();
                return ImageFileValidator.inspect(probe);
            });
            assertThat(probeStarted.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(probeRead.await(150, TimeUnit.MILLISECONDS)).isFalse();
            assertThat(waiting.isDone()).isFalse();

            release.countDown();
            var result = processing.get(5, TimeUnit.SECONDS);
            assertThat(result.width()).isEqualTo(8);
            assertThat(result.height()).isEqualTo(6);
            assertThat(result.contentType()).isEqualTo("image/png");
            assertThat(waiting.get(2, TimeUnit.SECONDS).width()).isEqualTo(8);
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }
}
