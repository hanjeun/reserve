package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.service.ChatImageService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ChatImageResponseTest {
    @Test void authenticatedPhotoNeverUsesPublicCachingAndHasSafeMimeHeaders() {
        var response = ChatImageController.imageResponse(new ChatImageService.ImageContent(new byte[]{1}, "image/png"));
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getContentType()).hasToString("image/png");
        assertThat(response.getHeaders().getFirst("Content-Disposition")).isEqualTo("inline; filename=chat-image");
    }
}
