package kr.it.reserve.config;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
@Timeout(15)
class AsyncPoolIsolationTest {
    @Test void fullMailQueueDoesNotBlockImagesOrGrowWithoutLimit() throws Exception {
        var config = new AsyncConfig();
        var mail = config.mailExecutor();
        var image = (ThreadPoolTaskExecutor) config.imageUploadExecutor();
        var started = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        try {
            for (int i = 0; i < 2; i++) mail.execute(() -> {
                started.countDown();
                try { release.await(5, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            for (int i = 0; i < 32; i++) mail.execute(() -> {});
            assertThatThrownBy(() -> mail.execute(() -> {})).isInstanceOf(TaskRejectedException.class);
            assertThat(mail.getMaxPoolSize()).isEqualTo(2);
            assertThat(mail.getThreadPoolExecutor().getQueue().size()).isEqualTo(32);
            var imageDone = new CountDownLatch(1); image.execute(imageDone::countDown);
            assertThat(imageDone.await(2, TimeUnit.SECONDS)).isTrue();
        } finally { release.countDown(); mail.shutdown(); image.shutdown(); }
    }
}
