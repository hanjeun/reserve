package kr.it.reserve.mailbox.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.mailbox.dto.AdminSentMailResponse;
import kr.it.reserve.mailbox.dto.ComposeMailRequest;
import kr.it.reserve.mailbox.service.AdminMailService;
import kr.it.reserve.member.entity.Member;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/** 관리자 메일함의 발송 내역을 다룬다. 받은 문의와 답변 등록은 Inquiry에서 처리한다. */
@RestController
@RequestMapping("/api/admin/mail")
@RequiredArgsConstructor
public class AdminMailController {

    private final AdminMailService adminMailService;
    private final RateLimiter rateLimiter;

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(value = "/preview", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<Map<String, String>> preview(@AuthenticationPrincipal Member admin,
            @Valid @RequestBody ComposeMailRequest request) {
        if (!rateLimiter.tryConsume("admin:" + admin.getId(), RateLimiter.Policy.MAIL_PREVIEW)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "미리보기 요청이 많아요. 잠시 후 다시 시도해주세요.");
        }
        return ApiResponse.success(Map.of("html", adminMailService.buildReplyHtml(request.getBody())), "메일 미리보기예요.");
    }

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
    @PostMapping(value = "/compose", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Void>> compose(
            @AuthenticationPrincipal Member admin,
            @Valid @RequestBody ComposeMailRequest request) {

        adminMailService.compose(admin.getId(), request, List.of());
        return ResponseEntity.ok(ApiResponse.success(null, "메일을 보냈어요."));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(value = "/compose", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Void>> composeWithPhotos(@AuthenticationPrincipal Member admin,
            @Valid @RequestPart("request") ComposeMailRequest request,
            @RequestPart(value = "photos", required = false) List<MultipartFile> photos) {
        adminMailService.compose(admin.getId(), request, photos);
        return ResponseEntity.ok(ApiResponse.success(null, "메일을 보냈어요."));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/sent/{id}/photos")
    public ApiResponse<List<Long>> getPhotos(@PathVariable Long id) {
        return ApiResponse.success(adminMailService.getPhotoIds(id), "첨부 사진을 불러왔어요.");
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/sent/{id}/photos/{photoId}")
    public ResponseEntity<byte[]> getPhoto(@PathVariable Long id, @PathVariable Long photoId) {
        return adminMailService.getPhoto(id, photoId);
    }
}
