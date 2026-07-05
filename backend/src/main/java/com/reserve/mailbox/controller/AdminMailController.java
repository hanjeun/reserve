package com.reserve.mailbox.controller;

import com.reserve.global.common.ApiResponse;
import com.reserve.mailbox.dto.AdminSentMailResponse;
import com.reserve.mailbox.dto.ComposeMailRequest;
import com.reserve.mailbox.service.AdminMailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 관리자 메일함 — 발송 전용.
 * (수신 웹훅/받은편지함 기능은 제거됨 — 문의는 Inquiry 도메인으로 대체,
 *  발신은 Resend/JavaMailSender 기반 "새 메일 작성" 기능만 유지)
 */
@RestController
@RequestMapping("/api/admin/mail")
@RequiredArgsConstructor
public class AdminMailController {

    private final AdminMailService adminMailService;

    // ── 보낸 메일 목록 (ADMIN) ────────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/sent")
    public ResponseEntity<ApiResponse<List<AdminSentMailResponse>>> getSentMailList() {
        List<AdminSentMailResponse> list = adminMailService.getSentMailList();
        return ResponseEntity.ok(ApiResponse.success(list, "보낸 메일 목록 조회 성공"));
    }

    // ── 새 메일 작성 발송 (ADMIN) ─────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/compose")
    public ResponseEntity<ApiResponse<Void>> compose(
            @Valid @RequestBody ComposeMailRequest request) {

        adminMailService.compose(request);
        return ResponseEntity.ok(ApiResponse.success(null, "메일을 보냈습니다."));
    }
}
