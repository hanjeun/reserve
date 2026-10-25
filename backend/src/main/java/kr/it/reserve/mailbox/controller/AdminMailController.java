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

    // 보낸 메일 목록 (ADMIN)
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/sent")
    public ResponseEntity<ApiResponse<Page<AdminSentMailResponse>>> getSentMailList(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {

        // 페이지 메타데이터는 page 아래에 반환한다.
        Page<AdminSentMailResponse> result = adminMailService.getSentMailList(page, size, search);
        return ResponseEntity.ok(ApiResponse.success(result, "보낸 메일 목록 조회 성공"));
    }

    // 보낸 메일 휴지통으로 이동 (ADMIN)
    /**
     * 소프트 삭제다. 휴지통 탭에서 30일 안에 복구할 수 있고, 그 뒤 스케줄러가 영구 삭제한다.
     * 관리자가 보존 기간을 건너뛰어 즉시 영구 삭제하는 HTTP 경로는 제공하지 않는다.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/sent/{id}")
    public ResponseEntity<ApiResponse<Void>> moveToTrash(@PathVariable Long id) {
        adminMailService.moveToTrash(id);
        return ResponseEntity.ok(ApiResponse.success(null, "휴지통으로 옮겼어요."));
    }

    // 새 메일 작성 발송 (ADMIN)
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/compose")
    public ResponseEntity<ApiResponse<Void>> compose(
            @Valid @RequestBody ComposeMailRequest request) {

        adminMailService.compose(request);
        return ResponseEntity.ok(ApiResponse.success(null, "메일을 보냈어요."));
    }
}
