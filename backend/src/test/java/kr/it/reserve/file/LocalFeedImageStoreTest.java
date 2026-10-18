package kr.it.reserve.file;

import kr.it.reserve.file.service.LocalFeedImageStore;
import kr.it.reserve.global.error.FileException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

class LocalFeedImageStoreTest {
    @TempDir Path directory;

    private LocalFeedImageStore store() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        return new LocalFeedImageStore(true, directory.resolve("encrypted-feed").toString(), environment);
    }

    @Test
    void localObjectsStayPrivateAndDeletingOneDoesNotRemoveAnother() throws Exception {
        LocalFeedImageStore store = store();
        byte[] encrypted = new byte[64];
        encrypted[0] = 42;
        String first = store.store(encrypted, "users/7/feed/images");
        String second = store.store(encrypted, "users/7/feed/images");
        assertThat(first).startsWith("local-feed/users/7/feed/images/").doesNotContain("http");
        assertThat(store.read(first, "users/7/feed/images")).isEqualTo(encrypted);
        assertThatThrownBy(() -> store.read(first, "users/8/feed/images")).isInstanceOf(FileException.class);
        assertThatThrownBy(() -> store.store(encrypted, "users/7/feed/images/../chat")).isInstanceOf(FileException.class);
        assertThatThrownBy(() -> store.delete("local-feed/../unrelated.bin")).isInstanceOf(FileException.class);
        store.delete(first);
        store.delete(first);
        assertThat(store.read(second, "users/7/feed/images")).isEqualTo(encrypted);
        try (var objects = Files.walk(directory)) {
            assertThat(objects.filter(Files::isRegularFile).count()).isEqualTo(1);
        }
    }

    @Test
    void productionAndMixedProfilesCannotEnableLocalStorage() {
        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("local", "green");
        Path destination = directory.resolve("must-not-exist");
        assertThatThrownBy(() -> new LocalFeedImageStore(true, destination.toString(), production))
                .isInstanceOf(IllegalStateException.class);
        assertThat(Files.exists(destination)).isFalse();
        assertThat(new LocalFeedImageStore(false, "", production).isEnabled()).isFalse();
    }
}
