package kr.it.reserve.store.service;

import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.controller.StorePageController;
import kr.it.reserve.store.dto.StoreResponse;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StorePageServiceTest {
    private final StoreService stores = mock(StoreService.class);

    private StorePageService pages() throws Exception {
        String html = Files.readString(Path.of("../frontend/index.html"))
                .replace("/src/main.jsx", "/assets/index-release.js");
        return new StorePageService(stores, new ByteArrayResource(html.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void originalHtmlEscapesPublicMetadataAndPreservesTheReleaseAssets() throws Exception {
        StoreResponse store = StoreResponse.builder().id(81L).name("가게 <&\"")
                .description("예약 <script>alert(1)</script>\n설명")
                .mainImageUrl("https://cdn.reserve.it.kr/users/1/stores/81/thumbnails/photo.webp")
                .mainImageWidth(640).mainImageHeight(480).build();
        when(stores.getStore(81L)).thenReturn(store);
        String html = pages().storePage(81L);
        assertThat(html).contains("<title>가게 &lt;&amp;&quot; | RESERVE</title>",
                        "content=\"https://reserve.it.kr/store/81\"", "href=\"https://reserve.it.kr/store/81\"",
                        "content=\"https://cdn.reserve.it.kr/users/1/stores/81/thumbnails/photo.webp\"",
                        "property=\"og:image:width\" content=\"640\"", "/assets/index-release.js", "<div id=\"root\"></div>")
                .doesNotContain("<script>alert(1)</script>", "property=\"og:image:type\"");
    }

    @Test
    void privateImagesAndSignedLinksKeepThePublicDefaultImage() throws Exception {
        for (String image : new String[]{"https://cdn.reserve.it.kr/users/1/chat/1/photo.bin",
                "https://cdn.reserve.it.kr/users/1/stores/81/thumbnails/photo.png?secret=private",
                "https://cdn.reserve.it.kr.evil.example/users/1/stores/81/thumbnails/photo.png",
                "javascript:alert(1)"}) {
            String html = pages().render(StoreResponse.builder().id(81L).name("가게").mainImageUrl(image).build());
            assertThat(html).contains("content=\"https://reserve.it.kr/og-image.png?v=20261021\"")
                    .doesNotContain(image);
        }
    }

    @Test
    void documentHintUsesTheFirstDetailPhotoWhileOgKeepsTheMainThumbnail() throws Exception {
        String main = "https://cdn.reserve.it.kr/users/1/stores/81/thumbnails/main.webp";
        String first = "https://cdn.reserve.it.kr/users/1/stores/81/images/portrait.webp";
        String second = "https://cdn.reserve.it.kr/users/1/stores/81/images/landscape.webp";
        StoreResponse store = StoreResponse.builder().id(81L).name("가게").ownerId(999L)
                .mainImageUrl(main).mainImageWidth(960).mainImageHeight(640)
                .detailImageUrls(List.of(first, second))
                .detailImageMeta(List.of(StoreResponse.ImageMeta.builder().url(first).width(600).height(800).build(),
                        StoreResponse.ImageMeta.builder().url(second).width(1200).height(500).build())).build();
        when(stores.getStore(81L)).thenReturn(store);
        String html = pages().storePage(81L);
        assertThat(html).contains("name=\"reserve-store-image-id\" content=\"81\"",
                        "name=\"reserve-store-image-url\" content=\"" + first + "\"",
                        "name=\"reserve-store-image-width\" content=\"600\"",
                        "name=\"reserve-store-image-height\" content=\"800\"",
                        "rel=\"preload\" as=\"image\" href=\"" + first + "\"",
                        "property=\"og:image\" content=\"" + main + "\"",
                        "property=\"og:image:width\" content=\"960\"", "/assets/index-release.js")
                .doesNotContain("ownerId", "999", second);
    }

    @Test
    void missingOrWrongDetailDimensionsNeverFallBackToTheMainThumbnailHint() throws Exception {
        String main = "https://cdn.reserve.it.kr/users/1/stores/81/thumbnails/main.webp";
        String first = "https://cdn.reserve.it.kr/users/1/stores/81/images/portrait.webp";
        for (StoreResponse.ImageMeta meta : List.of(
                StoreResponse.ImageMeta.builder().url(first).width(0).height(800).build(),
                StoreResponse.ImageMeta.builder().url(first).width(600).build(),
                StoreResponse.ImageMeta.builder().url(main).width(960).height(640).build())) {
            StoreResponse store = StoreResponse.builder().id(81L).name("가게")
                    .mainImageUrl(main).mainImageWidth(960).mainImageHeight(640)
                    .detailImageUrls(List.of(first)).detailImageMeta(List.of(meta)).build();
            assertThat(pages().render(store)).contains("property=\"og:image:width\" content=\"960\"")
                    .doesNotContain("reserve-store-image-", "rel=\"preload\" as=\"image\"");
        }
    }

    @Test
    void fullTrackRatioIsSeparateFromTheFirstPhotoAndRequiresEverySlideMeasurement() throws Exception {
        String first = "https://cdn.reserve.it.kr/users/1/stores/81/images/landscape.webp";
        String tall = "https://cdn.reserve.it.kr/users/1/stores/81/images/portrait.webp";
        var firstMeta = StoreResponse.ImageMeta.builder().url(first).width(1200).height(500).build();
        var tallMeta = StoreResponse.ImageMeta.builder().url(tall).width(600).height(800).build();
        for (boolean complete : List.of(true, false)) {
            StoreResponse store = StoreResponse.builder().id(81L).name("가게").detailImageUrls(List.of(first, tall))
                    .detailImageMeta(complete ? List.of(firstMeta, tallMeta) : List.of(firstMeta)).build();
            String html = pages().render(store);
            assertThat(html).contains("name=\"reserve-store-image-url\" content=\"" + first + "\"",
                    "name=\"reserve-store-image-width\" content=\"1200\"",
                    "name=\"reserve-store-image-height\" content=\"500\"",
                    "rel=\"preload\" as=\"image\" href=\"" + first + "\"")
                    .doesNotContain(tall);
            if (complete) assertThat(html).contains("name=\"reserve-store-image-layout-ratio\" content=\"0.75\"");
            else assertThat(html).doesNotContain("reserve-store-image-layout-ratio");
        }
    }

    @Test
    void documentHintsRejectPrivateSignedCrossStoreAndUntrustedPhotoSources() throws Exception {
        for (String url : List.of(
                "https://cdn.reserve.it.kr/users/1/chat/1/private.bin",
                "https://cdn.reserve.it.kr/users/1/stores/81/images/photo.webp?signature=private",
                "https://cdn.reserve.it.kr/users/1/stores/82/images/photo.webp",
                "https://cdn.reserve.it.kr.evil.example/users/1/stores/81/images/photo.webp",
                "https://user@cdn.reserve.it.kr/users/1/stores/81/images/photo.webp",
                "https://cdn.reserve.it.kr/users/1/stores/81/images/../private.webp",
                "https://cdn.reserve.it.kr/users/1/stores/81/images/%2e%2e",
                "https://cdn.reserve.it.kr/users/1/stores/81/images/photo.webp#private",
                "javascript:alert(1)")) {
            StoreResponse store = StoreResponse.builder().id(81L).name("가게").detailImageUrls(List.of(url))
                    .detailImageMeta(List.of(StoreResponse.ImageMeta.builder().url(url).width(600).height(800).build())).build();
            assertThat(pages().render(store)).doesNotContain("reserve-store-image-", "rel=\"preload\" as=\"image\"", url);
        }
    }

    @Test
    void unavailableStoresReturnAReal404WithoutPrivateMetadata() throws Exception {
        when(stores.getStore(81L)).thenThrow(StoreException.notFound());
        var response = new StorePageController(pages()).storePage(81L);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getHeaders().getFirst("X-Robots-Tag")).isEqualTo("noindex, nofollow");
        assertThat(response.getBody()).contains("가게를 찾을 수 없어요", "noindex, nofollow", "/assets/index-release.js")
                .doesNotContain("reserve-store-image-", "rel=\"preload\" as=\"image\"");
    }
}
