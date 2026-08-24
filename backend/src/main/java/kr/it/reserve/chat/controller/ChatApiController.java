package kr.it.reserve.chat.controller;

import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.SendMessageRequest;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.common.ApiResponse;
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

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/my/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> send(@Valid @RequestBody SendMessageRequest request) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
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
