package kr.it.reserve.chat.controller;

import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatReportRetentionResponse;
import kr.it.reserve.chat.dto.UpdateChatReportRetentionRequest;
import kr.it.reserve.chat.service.ChatReportRetentionService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/chat/reports")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminChatRetentionController {
    private final ChatReportRetentionService retention;

    @GetMapping("/{reportId}/retention")
    public ResponseEntity<ApiResponse<ChatReportRetentionResponse>> get(@PathVariable Long reportId) {
        return ResponseEntity.ok(ApiResponse.success(retention.get(
                SecurityUtil.getCurrentMember("로그인이 필요합니다."), reportId), "채팅 신고 보존 정책 조회 성공"));
    }

    @PatchMapping("/{reportId}/retention")
    public ResponseEntity<ApiResponse<ChatReportRetentionResponse>> update(@PathVariable Long reportId,
            @Valid @RequestBody UpdateChatReportRetentionRequest request) {
        return ResponseEntity.ok(ApiResponse.success(retention.update(
                SecurityUtil.getCurrentMember("로그인이 필요합니다."), reportId, request), "채팅 신고 보존 정책 변경 완료"));
    }
}
