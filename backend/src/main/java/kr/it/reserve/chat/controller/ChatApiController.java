package kr.it.reserve.chat.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.SendMessageRequest;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 손님용 채팅 API (2026-08-24 신설).
 *
 * <p>방 ID 를 클라이언트가 고르지 않는다 — 손님에게는 방이 하나뿐이고,
 * 서버가 회원으로부터 찾거나 만든다. ID 를 받으면 "남의 방 번호"를 넣어볼 여지가 생긴다.
 */
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatApiController {

    private final ChatService chatService;
    private final RateLimiter rateLimiter;

    /** 내 대화 열기 — 방이 없으면 만들고, 최근 메시지를 주고, 안 읽음을 0으로. */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/my")
    public ResponseEntity<ApiResponse<Map<String, Object>>> openMy() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        ChatRoom room = chatService.openMyRoom(me);
        List<ChatMessageResponse> messages = chatService.readMyMessages(me);
        return ResponseEntity.ok(ApiResponse.success(
                Map.of("roomId", room.getId(), "messages", messages), "대화 조회 성공"));
    }

    /**
     * 메시지 전송.
     *
     * <p>화면은 전송 중 버튼을 잠그지만 그건 <b>화면의 예의일 뿐</b>이다 —
     * API 를 직접 부르면 아무 제약이 없어서 계정 하나로 대화 테이블을 무한히 늘릴 수 있었다.
     * 한도 근거는 {@link RateLimiter.Policy#CHAT_SEND} 주석에 있다.
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/my/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> send(
            @Valid @RequestBody SendMessageRequest request,
            HttpServletRequest httpRequest) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        if (!rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.CHAT_SEND)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                chatService.sendAsMember(me, request.getContent()), "전송 완료"));
    }

    /**
     * 증분 폴링. 화면이 패널을 열고 있는 동안에만 부른다.
     * 방 소유 확인을 먼저 한다 — 이 경로만 방 ID 를 받기 때문이다.
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/my/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> poll(
            @RequestParam Long roomId,
            @RequestParam(required = false) Long afterId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        chatService.assertOwnedBy(roomId, me);
        return ResponseEntity.ok(ApiResponse.success(
                chatService.getNewMessages(roomId, afterId), "조회 성공"));
    }

    /** 배지용 — 패널이 닫혀 있을 때 훨씬 긴 주기로 부른다. */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/my/unread")
    public ResponseEntity<ApiResponse<Long>> unread() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.myUnreadCount(me), "조회 성공"));
    }
}
