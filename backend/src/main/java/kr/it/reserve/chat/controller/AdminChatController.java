package kr.it.reserve.chat.controller;

import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatRoomResponse;
import kr.it.reserve.chat.dto.SendMessageRequest;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 관리자용 채팅 API (2026-08-24 신설). */
@RestController
@RequestMapping("/api/admin/chat")
@RequiredArgsConstructor
public class AdminChatController {

    private final ChatService chatService;

    /** 방 목록 — 안 읽은 방이 먼저, 그다음 최근 순. */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<Page<ChatRoomResponse>>> rooms(
            @RequestParam(defaultValue = "0") int page) {
        return ResponseEntity.ok(ApiResponse.success(chatService.listRoomsForAdmin(page), "조회 성공"));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> messages(@PathVariable Long roomId) {
        return ResponseEntity.ok(ApiResponse.success(chatService.readRoomAsAdmin(roomId), "조회 성공"));
    }

    /** 증분 폴링 — 관리자가 방을 열어둔 동안. */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> poll(
            @PathVariable Long roomId,
            @RequestParam(required = false) Long afterId) {
        return ResponseEntity.ok(ApiResponse.success(chatService.getNewMessages(roomId, afterId), "조회 성공"));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> reply(
            @PathVariable Long roomId,
            @Valid @RequestBody SendMessageRequest request) {
        Member admin = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.sendAsAdmin(admin, roomId, request.getContent()), "전송 완료"));
    }

    /** 탭 배지 — 답을 기다리는 방 개수. */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/waiting-count")
    public ResponseEntity<ApiResponse<Long>> waitingCount() {
        return ResponseEntity.ok(ApiResponse.success(chatService.adminWaitingRoomCount(), "조회 성공"));
    }
}
