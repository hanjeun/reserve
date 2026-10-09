package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.service.ChatMessageVisibilityService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat/rooms/{roomId}/messages/{messageId}")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChatMessageVisibilityController {
    private final ChatMessageVisibilityService visibility;
    private final RateLimiter limiter;

    @PostMapping("/hide")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> hide(@PathVariable Long roomId, @PathVariable Long messageId) {
        var actor = SecurityUtil.getCurrentMember("로그인이 필요해요.");
        if (!limiter.tryConsume("member-" + actor.getId(), RateLimiter.Policy.CHAT_SEND)) {
            return ResponseEntity.status(429).body(ApiResponse.error("잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(visibility.hide(actor, roomId, messageId), "나에게만 삭제했어요."));
    }
}
