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
            assertThat(html).contains("content=\"https://reserve.it.kr/og-image.png?v=20260928\"")
                    .doesNotContain(image);
        }
    }

    @Test
    void unavailableStoresReturnAReal404WithoutPrivateMetadata() throws Exception {
        when(stores.getStore(81L)).thenThrow(StoreException.notFound());
        var response = new StorePageController(pages()).storePage(81L);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getHeaders().getFirst("X-Robots-Tag")).isEqualTo("noindex, nofollow");
        assertThat(response.getBody()).contains("가게를 찾을 수 없어요", "noindex, nofollow", "/assets/index-release.js");
    }
}
