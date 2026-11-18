package kr.it.reserve.chat.controller;

import kr.it.reserve.config.ApiVersionConfiguration;
import kr.it.reserve.chat.service.ChatImageService;
import kr.it.reserve.chat.service.ChatAttachmentFilename;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.ContentDisposition;
import org.springframework.mock.web.MockMultipartFile;
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

    @Test void thumbnailUsesThePrivateImageResponseAndPermissionOnlyHead() throws Exception {
        var images = mock(ChatImageService.class);
        var member = Member.builder().id(1L).build();
        var bytes = new byte[]{1, 2};
        when(images.thumbnail(member, 33L)).thenReturn(new ChatImageService.ImageContent(bytes, "image/jpeg"));
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(() -> SecurityUtil.getCurrentMember("로그인이 필요해요.")).thenReturn(member);
            var mvc = MockMvcBuilders.standaloneSetup(new ChatImageController(images, mock(RateLimiter.class)))
                    .setCustomHandlerMapping(new ApiVersionConfiguration()::getRequestMappingHandlerMapping).build();
            mvc.perform(head("/api/v1/chat/images/33/thumbnail")).andExpect(status().isNoContent())
                    .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(new byte[0]));
            verify(images).assertReadable(member, 33L);
            verify(images, never()).thumbnail(any(), any());
            mvc.perform(get("/api/chat/images/33/thumbnail")).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(content().contentType("image/jpeg")).andExpect(content().bytes(bytes));
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
        assertThat(ChatAttachmentFilename.sanitize("C:\\fakepath\\가게\r\n사진.html", "image/png")).isEqualTo("가게사진.png");
        assertThat(ChatAttachmentFilename.sanitize("../사진.JPEG", "image/jpeg")).isEqualTo("사진.JPEG");
        assertThat(ChatAttachmentFilename.sanitize("NUL.png", "image/png")).isEqualTo("_NUL.png");
        assertThat(ChatAttachmentFilename.forDownload("\r\n", "image/png")).isEqualTo("chat-image.png");
        assertThat(ChatAttachmentFilename.sanitize("photo" + " .".repeat(10_000), "image/png")).isEqualTo("photo.png");
        String longName = ChatAttachmentFilename.sanitize("사진🍊".repeat(100) + ".png", "image/png");
        assertThat(longName.getBytes(StandardCharsets.UTF_8)).hasSizeLessThanOrEqualTo(255);
        assertThat(longName).endsWith(".png").doesNotContain("\uFFFD");
    }

    @Test void documentEndpointBindsTheFileAndOnlyReturnsADownloadWithSafeHeaders() throws Exception {
        var images = mock(ChatImageService.class);
        var member = Member.builder().id(1L).build();
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any(RateLimiter.Policy.class))).thenReturn(true);
        byte[] bytes = "문의 자료".getBytes(StandardCharsets.UTF_8);
        when(images.readDocument(member, 35L)).thenReturn(new ChatImageService.ImageContent(bytes, "text/plain", "자료.TXT"));
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(() -> SecurityUtil.getCurrentMember("로그인이 필요해요.")).thenReturn(member);
            var mvc = MockMvcBuilders.standaloneSetup(new ChatImageController(images, limiter))
                    .setCustomHandlerMapping(new ApiVersionConfiguration()::getRequestMappingHandlerMapping).build();
            mvc.perform(multipart("/api/chat/rooms/10/files")
                    .file(new MockMultipartFile("file", "자료.TXT", "text/plain", bytes))
                    .param("clientMessageId", "document-1"))
                    .andExpect(status().isOk());
            verify(images).sendDocument(eq(member), eq(10L), argThat(file -> "자료.TXT".equals(file.getOriginalFilename())),
                    argThat(request -> "document-1".equals(request.getClientMessageId())));
            var result = mvc.perform(get("/api/v1/chat/files/35")).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                    .andExpect(content().contentType("application/octet-stream")).andExpect(content().bytes(bytes))
                    .andReturn();
            var disposition = ContentDisposition.parse(result.getResponse().getHeader("Content-Disposition"));
            assertThat(disposition.isAttachment()).isTrue();
            assertThat(disposition.getFilename()).isEqualTo("자료.TXT");
        }
    }
}
