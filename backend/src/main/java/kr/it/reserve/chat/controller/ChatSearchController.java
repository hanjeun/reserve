package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.search.ChatSearchService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
@RequestMapping("/api/chat/search")
public class ChatSearchController {
    private final ChatSearchService search;
    private final RateLimiter limiter;
    public record Request(String keyword, String scope, int page) {
        @Override public String toString() { return "ChatSearchRequest[redacted]"; }
    }

    // 검색어가 URL·접근 로그에 남지 않도록 읽기 전용 POST를 사용해요.
    @PostMapping
    public ResponseEntity<ApiResponse<ChatSearchService.Result>> search(@RequestBody Request request) {
        var member = SecurityUtil.getCurrentMember();
        limit(member);
        var result = search.search(member, request.keyword(),
                request.scope() == null ? "all" : request.scope(), request.page());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(result, "채팅 검색 성공"));
    }
    @GetMapping("/context")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> context(@RequestParam Long roomId, @RequestParam Long messageId) {
        var member = SecurityUtil.getCurrentMember();
        limit(member);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                search.context(member, roomId, messageId), "검색 메시지 조회 성공"));
    }
    private void limit(Member member) {
        if (!limiter.tryConsume("chat-search:" + member.getId(), RateLimiter.Policy.PROFILE_READ))
            throw new ChatException("검색 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
    }
}
