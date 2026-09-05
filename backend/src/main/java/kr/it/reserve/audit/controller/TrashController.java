package kr.it.reserve.audit.controller;

import kr.it.reserve.audit.dto.AuditLogResponse;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/trash")
@RequiredArgsConstructor
@Slf4j
public class TrashController {

    private final AuditLogService auditLogService;

    /** 휴지통 목록 (복구 가능한 소프트삭제 항목) */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Page<AuditLogResponse>>> getTrash(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<AuditLogResponse> result = auditLogService.getTrashItems(type, pageable)
                .map(AuditLogResponse::from);
        return ResponseEntity.ok(ApiResponse.success(result, "휴지통 목록 조회 성공"));
    }

    /** 복구 */
    @PostMapping("/{type}/{id}/restore")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> restore(
            @PathVariable String type,
            @PathVariable Long id) {
        auditLogService.restore(type, id);
        return ResponseEntity.ok(ApiResponse.success(null, "복구 완료"));
    }

}
