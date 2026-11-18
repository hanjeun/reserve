package kr.it.reserve.store.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StorePublicImageTest {
    @Test
    void validatesTheThumbnailInTheConfiguredStorageNamespace() {
        String cdn = "https://cdn.reserve.it.kr";
        String path = "/users/7/stores/42/thumbnails/main.webp";
        String local = cdn + "/local" + path;
        assertThat(StorePublicImage.thumbnail(cdn + path, 42L)).isEqualTo(cdn + path);
        assertThat(StorePublicImage.thumbnail(local, 42L, "local")).isEqualTo(local);
        assertThat(StorePublicImage.thumbnail(local, 42L)).isNull();
        assertThat(StorePublicImage.thumbnail(cdn + path, 42L, "local")).isNull();
        assertThat(StorePublicImage.thumbnail(local, 41L, "local")).isNull();
        assertThat(StorePublicImage.thumbnail(local + "?signed=fixture", 42L, "local")).isNull();
        assertThat(StorePublicImage.thumbnail(local.replace("/thumbnails/", "/images/"), 42L, "local")).isNull();
    }
}
