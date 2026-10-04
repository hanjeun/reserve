package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ChatRetentionPolicyResponse;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatRetentionPolicyController {
    private final ChatRetentionPolicy policy;

    @GetMapping("/retention-policy")
    public ResponseEntity<ApiResponse<ChatRetentionPolicyResponse>> get() {
        return ResponseEntity.ok(ApiResponse.success(ChatRetentionPolicyResponse.from(
                policy, LocalDateTime.now(Clock.systemUTC())), "채팅 보존 정책 조회 성공"));
    }
}
