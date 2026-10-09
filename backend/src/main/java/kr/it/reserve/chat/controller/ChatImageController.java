package kr.it.reserve.chat.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.SendChatImageRequest;
import kr.it.reserve.chat.service.ChatImageService;
import kr.it.reserve.chat.service.ChatImageFilename;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChatImageController {
    private final ChatImageService images;
    private final RateLimiter limiter;

    @GetMapping("/images/config")
    public ApiResponse<Map<String, Object>> config() {
        return ApiResponse.success(Map.of("enabled", images.isEnabled(), "maxBytes", ImageFileValidator.MAX_FILE_BYTES),
                "사진 첨부 설정 조회 성공");
    }

    @PostMapping(value = "/rooms/{roomId}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ChatMessageResponse>> send(@PathVariable Long roomId,
            @RequestPart("image") MultipartFile image, @Valid @ModelAttribute SendChatImageRequest request,
            HttpServletRequest httpRequest) {
        var member = SecurityUtil.getCurrentMember("로그인이 필요해요.");
        if (!limiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.CHAT_SEND)
                || !limiter.tryConsume("chat-image-member:" + member.getId(), RateLimiter.Policy.CHAT_SEND)) {
            return ResponseEntity.status(429).body(ApiResponse.error("조금 천천히 보내주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(images.send(member, roomId, image, request), "전송 완료"));
    }

    @GetMapping("/images/{messageId:[0-9]+}")
    public ResponseEntity<byte[]> read(@PathVariable Long messageId) {
        var image = images.read(SecurityUtil.getCurrentMember("로그인이 필요해요."), messageId);
        return imageResponse(image);
    }

    static ResponseEntity<byte[]> imageResponse(ChatImageService.ImageContent image) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.PRAGMA, "no-cache").header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(ChatImageFilename.forDownload(image.originalFilename(), image.contentType()), StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
}
