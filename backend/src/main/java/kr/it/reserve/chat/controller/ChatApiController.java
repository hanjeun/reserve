package kr.it.reserve.chat.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatHistoryResponse;
import kr.it.reserve.chat.dto.SendMessageRequest;
import kr.it.reserve.chat.dto.ConversationSummaryResponse;
import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.dto.ChatReportResponse;
import kr.it.reserve.chat.dto.ConversationModerationStateResponse;
import kr.it.reserve.chat.dto.CreateChatReportRequest;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.ChatModerationService;
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
import org.springframework.data.domain.Page;

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
    private final ChatModerationService moderationService;
    private final RateLimiter rateLimiter;

    /** MessengerShell 목록. 빈 고객지원 방은 만들지 않고 실제 대화만 반환한다. */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/conversations")
    public ResponseEntity<ApiResponse<Page<ConversationSummaryResponse>>> conversations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "false") boolean hidden) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.listMyConversations(me, page, hidden), "대화 목록 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/support")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> support() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.getSupportConversation(me), "고객지원 대화 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/support/open")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> openSupport() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.openSupportConversation(me), "고객지원 대화 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/support/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendSupport(
            @Valid @RequestBody SendMessageRequest request,
            HttpServletRequest httpRequest) {
        if (!canSend(httpRequest)) return tooManyRequests();
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.sendAsMember(me, request.getContent(), request.getClientMessageId()), "전송 완료"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stores/{storeId}")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> storeConversation(
            @PathVariable Long storeId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.getStoreConversation(me, storeId), "가게 대화 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/stores/{storeId}/open")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> openStoreConversation(@PathVariable Long storeId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.openStoreConversation(me, storeId), "가게 대화 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/stores/{storeId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendStoreMessage(
            @PathVariable Long storeId,
            @Valid @RequestBody SendMessageRequest request,
            HttpServletRequest httpRequest) {
        if (!canSend(httpRequest)) return tooManyRequests();
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.sendAsMemberToStore(
                        me, storeId, request.getContent(), request.getClientMessageId()), "전송 완료"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/store-inbox")
    public ResponseEntity<ApiResponse<Page<ConversationSummaryResponse>>> storeInbox(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "false") boolean hidden) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.listStoreInbox(me, page, hidden), "가게 받은 문의 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/store-inbox/{roomId}")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> openStoreInbox(
            @PathVariable Long roomId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.getRoomAsOwner(me, roomId), "가게 문의 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/store-inbox/{roomId}/open")
    public ResponseEntity<ApiResponse<ConversationThreadResponse>> markStoreInboxOpened(@PathVariable Long roomId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.readRoomAsOwner(me, roomId), "가게 문의 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/store-inbox/{roomId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> replyStoreMessage(
            @PathVariable Long roomId,
            @Valid @RequestBody SendMessageRequest request,
            HttpServletRequest httpRequest) {
        if (!canSend(httpRequest)) return tooManyRequests();
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                chatService.sendAsOwner(
                        me, roomId, request.getContent(), request.getClientMessageId()), "전송 완료"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> pollConversation(
            @PathVariable Long roomId,
            @RequestParam(required = false) Long afterId) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        chatService.assertParticipant(roomId, me);
        return ResponseEntity.ok(ApiResponse.success(
                chatService.getNewMessages(roomId, afterId, me.getId()), "조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/rooms/{roomId}/history")
    public ResponseEntity<ApiResponse<ChatHistoryResponse>> conversationHistory(
            @PathVariable Long roomId,
            @RequestParam Long beforeId,
            @RequestParam(defaultValue = "50") int size) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        chatService.assertParticipant(roomId, me);
        return ResponseEntity.ok(ApiResponse.success(
                chatService.getOlderMessages(roomId, beforeId, size, me.getId()), "이전 대화 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/rooms/{roomId}/read")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> markConversationRead(
            @PathVariable Long roomId,
            @RequestParam(defaultValue = "MEMBER") String viewerRole) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        chatService.markReadAsParticipant(roomId, me, viewerRole);
        return ResponseEntity.ok(ApiResponse.success(Map.of("read", true), "읽음 처리 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/rooms/{roomId}/block")
    public ResponseEntity<ApiResponse<ConversationModerationStateResponse>> setConversationBlocked(
            @PathVariable Long roomId,
            @RequestParam String viewerRole,
            @RequestParam(defaultValue = "true") boolean blocked) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                moderationService.setBlocked(me, roomId, viewerRole, blocked),
                blocked ? "대화를 차단했습니다." : "대화 차단을 해제했습니다."));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/rooms/{roomId}/visibility")
    public ResponseEntity<ApiResponse<Void>> setVisibility(@PathVariable Long roomId,
            @RequestParam String viewerRole, @RequestParam boolean hidden) {
        moderationService.setHidden(SecurityUtil.getCurrentMember("로그인이 필요합니다."), roomId, viewerRole, hidden);
        return ResponseEntity.ok(ApiResponse.success(null, hidden ? "내 목록에서 숨겼습니다." : "대화를 복원했습니다."));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/rooms/{roomId}/reports")
    public ResponseEntity<ApiResponse<ChatReportResponse>> reportConversation(
            @PathVariable Long roomId,
            @RequestParam String viewerRole,
            @Valid @RequestBody CreateChatReportRequest request) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        if (!rateLimiter.tryConsume("member-" + me.getId(), RateLimiter.Policy.CHAT_REPORT)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                moderationService.createReport(me, roomId, viewerRole, request), "신고를 접수했습니다."));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/unread")
    public ResponseEntity<ApiResponse<Long>> totalUnread() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.totalUnreadCount(me), "조회 성공"));
    }

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
                chatService.sendAsMember(me, request.getContent(), request.getClientMessageId()), "전송 완료"));
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
                chatService.getNewMessages(roomId, afterId, me.getId()), "조회 성공"));
    }

    /** 배지용 — 패널이 닫혀 있을 때 훨씬 긴 주기로 부른다. */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/my/unread")
    public ResponseEntity<ApiResponse<Long>> unread() {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(chatService.myUnreadCount(me), "조회 성공"));
    }

    private boolean canSend(HttpServletRequest request) {
        return rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.CHAT_SEND);
    }

    private ResponseEntity<ApiResponse<ChatMessageResponse>> tooManyRequests() {
        return ResponseEntity.status(429)
                .body(ApiResponse.error("메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요."));
    }
}
