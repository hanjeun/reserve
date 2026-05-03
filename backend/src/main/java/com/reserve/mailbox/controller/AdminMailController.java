package com.reserve.mailbox.controller;

import com.reserve.global.common.ApiResponse;
import com.reserve.mailbox.dto.*;
import com.reserve.mailbox.service.AdminMailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/admin/mail")
@RequiredArgsConstructor
public class AdminMailController {

    private final AdminMailService adminMailService;

    @Value("${mail.webhook-secret:}")
    private String webhookSecret;

    @jakarta.annotation.PostConstruct
    public void warnIfWebhookSecretMissing() {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.warn("⚠️  MAIL_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다. " +
                     "누구나 /api/admin/mail/webhook 을 호출할 수 있습니다. " +
                     "운영 환경에서는 반드시 설정하세요.");
        }
    }

    // ── 웹훅 수신 (ImprovMX 호출 — 인증 없음, Secret 헤더 검증) ──
    @PostMapping("/webhook")
    public ResponseEntity<Void> receiveWebhook(
            @RequestHeader(value = "X-Webhook-Secret", required = false) String secret,
            @RequestBody MailWebhookPayload payload) {

        // Secret 설정된 경우에만 검증
        if (!webhookSecret.isBlank() && !webhookSecret.equals(secret)) {
            log.warn("웹훅 시크릿 불일치 — 요청 거부");
            return ResponseEntity.status(401).build();
        }

        adminMailService.receiveWebhook(payload);
        return ResponseEntity.ok().build();
    }

    // ── 메일 목록 (ADMIN) ──────────────────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<ApiResponse<List<AdminMailListResponse>>> getMailList() {
        List<AdminMailListResponse> list = adminMailService.getMailList();
        return ResponseEntity.ok(ApiResponse.success(list, "메일 목록 조회 성공"));
    }

    // ── 읽지 않은 메일 개수 (ADMIN) ───────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCount() {
        long count = adminMailService.getUnreadCount();
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", count), "읽지 않은 메일 수 조회 성공"));
    }

    // ── 메일 상세 + 읽음 처리 (ADMIN) ─────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<AdminMailDetailResponse>> getMailDetail(@PathVariable Long id) {
        AdminMailDetailResponse detail = adminMailService.getMailDetail(id);
        return ResponseEntity.ok(ApiResponse.success(detail, "메일 상세 조회 성공"));
    }

    // ── 답장 발송 (ADMIN) ──────────────────────────────────────
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/reply")
    public ResponseEntity<ApiResponse<Void>> reply(
            @PathVariable Long id,
            @Valid @RequestBody MailReplyRequest request) {

        adminMailService.reply(id, request);
        return ResponseEntity.ok(ApiResponse.success(null, "답장을 보냈습니다."));
    }

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
