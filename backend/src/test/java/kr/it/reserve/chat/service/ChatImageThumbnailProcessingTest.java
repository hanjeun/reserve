package kr.it.reserve.chat.service;

import kr.it.reserve.file.util.ImageFileValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mockStatic;

@Timeout(20)
class ChatImageThumbnailProcessingTest {
    @Test
    void legacyThumbnailDecodingWaitsForTheSameGlobalImageSlot() throws Exception {
        byte[] bytes = png();
        var occupied = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var requested = new CountDownLatch(1);
        var readerEntered = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var holder = executor.submit(() -> ImageFileValidator.withProcessingSlot(() -> {
                occupied.countDown();
                try {
                    if (!release.await(12, TimeUnit.SECONDS)) throw new AssertionError("Synthetic slot holder was not released");
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                }
                return null;
            }));
            assertThat(occupied.await(2, TimeUnit.SECONDS)).isTrue();
            var thumbnail = executor.submit(() -> {
                try (var imageIo = mockStatic(ImageIO.class, invocation -> {
                    if (invocation.getMethod().getName().equals("getImageReaders")) readerEntered.countDown();
                    return invocation.callRealMethod();
                })) {
                    requested.countDown();
                    return ChatImageThumbnail.create(bytes, 6);
                }
            });
            assertThat(requested.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(readerEntered.await(150, TimeUnit.MILLISECONDS)).isFalse();
            assertThat(thumbnail.isDone()).isFalse();

            release.countDown();
            holder.get(2, TimeUnit.SECONDS);
            var result = ImageIO.read(new ByteArrayInputStream(thumbnail.get(5, TimeUnit.SECONDS)));
            try {
                assertThat(result.getWidth()).isEqualTo(30);
                assertThat(result.getHeight()).isEqualTo(40);
            } finally { result.flush(); }
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void aFailedThumbnailReturnsTheSlotToAnotherThread() throws Exception {
        assertThatThrownBy(() -> ChatImageThumbnail.create(new byte[]{1, 2, 3}, 1)).isInstanceOf(RuntimeException.class);
        var executor = Executors.newSingleThreadExecutor();
        byte[] bytes = png();
        try {
            assertThat(executor.submit(() -> ChatImageThumbnail.create(bytes, 1)).get(2, TimeUnit.SECONDS)).isNotEmpty();
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    private static byte[] png() throws Exception {
        var pixels = new BufferedImage(40, 30, BufferedImage.TYPE_INT_ARGB);
        var output = new ByteArrayOutputStream();
        try { ImageIO.write(pixels, "png", output); }
        finally { pixels.flush(); }
        return output.toByteArray();
    }
}
