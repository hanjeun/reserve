package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.service.ChatRetractionService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat/rooms/{roomId}")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChatRetractionController {
    private final ChatRetractionService retractions;
    private final RateLimiter limiter;

    @PostMapping("/messages/{messageId}/retract")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> retract(@PathVariable Long roomId, @PathVariable Long messageId) {
        var actor = SecurityUtil.getCurrentMember("로그인이 필요해요.");
        if (!limiter.tryConsume("member-" + actor.getId(), RateLimiter.Policy.CHAT_SEND)) {
            return ResponseEntity.status(429).body(ApiResponse.error("잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(retractions.retract(actor, roomId, messageId), "전송을 취소했어요."));
    }

    @GetMapping("/retractions")
    public ResponseEntity<ApiResponse<ChatRetractionService.Retractions>> changes(
            @PathVariable Long roomId, @RequestParam(defaultValue = "0") long afterRevision) {
        var actor = SecurityUtil.getCurrentMember("로그인이 필요해요.");
        return ResponseEntity.ok(ApiResponse.success(retractions.changes(actor, roomId, afterRevision), "조회 성공"));
    }
}
