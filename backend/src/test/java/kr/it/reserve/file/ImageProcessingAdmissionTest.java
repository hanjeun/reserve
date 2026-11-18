package kr.it.reserve.file;

import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.FileException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Timeout(15)
class ImageProcessingAdmissionTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void multipartBytesAreNotReadUntilTheGlobalSlotIsAvailable(boolean dimensionsOnly) throws Exception {
        var read = new CountDownLatch(1);
        var file = file(read);
        var occupied = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var requested = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = occupy(executor, occupied, release);
            assertThat(occupied.await(2, TimeUnit.SECONDS)).isTrue();
            var waiting = executor.submit(() -> {
                requested.countDown();
                return dimensionsOnly ? ImageFileValidator.readDimensions(file) : ImageFileValidator.inspect(file);
            });
            assertThat(requested.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(read.await(150, TimeUnit.MILLISECONDS)).isFalse();
            assertThat(waiting.isDone()).isFalse();

            release.countDown();
            holder.get(2, TimeUnit.SECONDS);
            assertThat(waiting.get(2, TimeUnit.SECONDS)).isNotNull();
            assertThat(read.getCount()).isZero();
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void aTimedOutWaitDoesNotReadBytesOrReleaseAnotherThreadsSlot() throws Exception {
        var read = new CountDownLatch(1);
        var file = file(read);
        var occupied = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> holder = occupy(executor, occupied, release);
            assertThat(occupied.await(2, TimeUnit.SECONDS)).isTrue();

            assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                    .isInstanceOfSatisfying(FileException.class, error ->
                            assertThat(error.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
            assertThat(read.getCount()).isEqualTo(1);
            assertThat(holder.isDone()).isFalse();

            release.countDown();
            holder.get(2, TimeUnit.SECONDS);
            assertThat(ImageFileValidator.inspect(file).width()).isEqualTo(4);
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void anInterruptedAdmissionRestoresTheFlagBeforeReadingBytes() throws Exception {
        var read = new CountDownLatch(1);
        var file = file(read);
        try {
            Thread.currentThread().interrupt();

            assertThatThrownBy(() -> ImageFileValidator.inspect(file))
                    .isInstanceOfSatisfying(FileException.class, error ->
                            assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(read.getCount()).isEqualTo(1);
        } finally { Thread.interrupted(); }
        assertThat(ImageFileValidator.inspect(file).width()).isEqualTo(4);
    }

    @Test
    void nestedValidationAndAProcessingFailureReleaseTheWholeSlot() throws Exception {
        var file = file(new CountDownLatch(1));
        var failure = new IllegalStateException("synthetic processing failure");
        var executor = Executors.newSingleThreadExecutor();
        try {
            var failed = executor.submit(() -> {
                assertThatThrownBy(() -> ImageFileValidator.withProcessingSlot(() -> {
                    assertThat(ImageFileValidator.inspect(file).height()).isEqualTo(3);
                    throw failure;
                })).isSameAs(failure);
            });
            failed.get(2, TimeUnit.SECONDS);

            assertThat(ImageFileValidator.inspect(file).width()).isEqualTo(4);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void cancellationOfAnAdmittedOperationReleasesTheSlotForAnotherThread() throws Exception {
        var occupied = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        var file = file(new CountDownLatch(1));
        try {
            Future<?> holder = occupy(executor, occupied, release);
            assertThat(occupied.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(holder.cancel(true)).isTrue();

            assertThat(ImageFileValidator.inspect(file).height()).isEqualTo(3);
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    private static Future<?> occupy(ExecutorService executor, CountDownLatch occupied, CountDownLatch release) {
        return executor.submit(() -> ImageFileValidator.withProcessingSlot(() -> {
            occupied.countDown();
            try {
                if (!release.await(12, TimeUnit.SECONDS)) throw new AssertionError("Synthetic slot holder was not released");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Synthetic operation interrupted", interrupted);
            }
            return null;
        }));
    }

    private static MultipartFile file(CountDownLatch read) throws Exception {
        var pixels = new BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB);
        var output = new ByteArrayOutputStream();
        try { ImageIO.write(pixels, "png", output); }
        finally { pixels.flush(); }
        byte[] bytes = output.toByteArray();
        var file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getSize()).thenReturn((long) bytes.length);
        when(file.getContentType()).thenReturn("image/png");
        when(file.getOriginalFilename()).thenReturn("test.png");
        when(file.getBytes()).thenAnswer(invocation -> { read.countDown(); return bytes; });
        return file;
    }
}
