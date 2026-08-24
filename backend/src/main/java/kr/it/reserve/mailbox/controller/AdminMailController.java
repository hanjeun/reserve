package kr.it.reserve.mailbox.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.mailbox.dto.AdminSentMailResponse;
import kr.it.reserve.mailbox.dto.ComposeMailRequest;
import kr.it.reserve.mailbox.service.AdminMailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
    public ResponseEntity<ApiResponse<Page<AdminSentMailResponse>>> getSentMailList(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {

        // ★ 응답 형식이 바뀐다: 예전에는 배열을 그대로 돌려줬고 지금은 Spring Page 다.
        // 프론트는 content 와 page.totalElements 를 읽는다
        // (Spring Boot 3.5 부터 페이지 메타가 page 하위로 이동했다).
        // 이 엔드포인트를 쓰는 곳은 관리자 메일함 화면 하나뿐이라 함께 바꾸면 된다.
        Page<AdminSentMailResponse> result = adminMailService.getSentMailList(page, size, search);
        return ResponseEntity.ok(ApiResponse.success(result, "보낸 메일 목록 조회 성공"));
    }

    // ── 보낸 메일 휴지통으로 이동 (ADMIN) ─────────────────
    /**
     * 소프트 삭제다. 휴지통 탭에서 30일 안에 복구할 수 있고, 그 뒤 스케줄러가 영구 삭제한다.
     * 영구 삭제는 이 엔드포인트가 아니라 {@code DELETE /api/admin/trash/SENT_MAIL/{id}} 가 맡는다 —
     * 되돌릴 수 없는 동작은 휴지통 화면 한 곳에만 두는 게 맞다.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/sent/{id}")
    public ResponseEntity<ApiResponse<Void>> moveToTrash(@PathVariable Long id) {
        adminMailService.moveToTrash(id);
        return ResponseEntity.ok(ApiResponse.success(null, "휴지통으로 옮겼습니다."));
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
