package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.service.ChatImageService;
import kr.it.reserve.chat.service.ChatImageFilename;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.ContentDisposition;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

class ChatImageResponseTest {
    @Test void headRechecksAccessWithoutDispatchingAnImageRead() throws Exception {
        var images = mock(ChatImageService.class);
        var member = Member.builder().id(1L).build();
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(() -> SecurityUtil.getCurrentMember("로그인이 필요해요.")).thenReturn(member);
            var mvc = MockMvcBuilders.standaloneSetup(new ChatImageController(images, mock(RateLimiter.class))).build();
            mvc.perform(head("/api/chat/images/33")).andExpect(status().isNoContent())
                    .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(new byte[0]));
            verify(images).assertReadable(member, 33L);
            verify(images, never()).read(any(), any());
        }
    }

    @Test void authenticatedPhotoNeverUsesPublicCachingAndHasSafeMimeHeaders() {
        var response = ChatImageController.imageResponse(new ChatImageService.ImageContent(new byte[]{1}, "image/png"));
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getContentType()).hasToString("image/png");
        assertThat(ContentDisposition.parse(response.getHeaders().getFirst("Content-Disposition")).getFilename()).isEqualTo("chat-image.png");
    }

    @Test void authenticatedPhotoPreservesUnicodeFilenameAndOriginalBody() {
        byte[] bytes = {1, 2, 3};
        var response = ChatImageController.imageResponse(new ChatImageService.ImageContent(bytes, "image/png", "가게 사진 2026-10-04.PNG"));
        String header = response.getHeaders().getFirst("Content-Disposition");
        assertThat(ContentDisposition.parse(header).getFilename()).isEqualTo("가게 사진 2026-10-04.PNG");
        assertThat(header).contains("filename*=UTF-8''").doesNotContain("\r", "\n");
        assertThat(response.getBody()).isEqualTo(bytes);
    }

    @Test void unsafeAndLongNamesStayWithinTheDownloadBoundary() {
        assertThat(ChatImageFilename.sanitize("C:\\fakepath\\가게\r\n사진.html", "image/png")).isEqualTo("가게사진.png");
        assertThat(ChatImageFilename.sanitize("../사진.JPEG", "image/jpeg")).isEqualTo("사진.JPEG");
        assertThat(ChatImageFilename.sanitize("NUL.png", "image/png")).isEqualTo("_NUL.png");
        assertThat(ChatImageFilename.forDownload("\r\n", "image/png")).isEqualTo("chat-image.png");
        assertThat(ChatImageFilename.sanitize("photo" + " .".repeat(10_000), "image/png")).isEqualTo("photo.png");
        String longName = ChatImageFilename.sanitize("사진🍊".repeat(100) + ".png", "image/png");
        assertThat(longName.getBytes(StandardCharsets.UTF_8)).hasSizeLessThanOrEqualTo(255);
        assertThat(longName).endsWith(".png").doesNotContain("\uFFFD");
    }
}
