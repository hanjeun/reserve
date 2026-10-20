package kr.it.reserve.feed.controller;

import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.service.*;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/admin/feed") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class AdminFeedController {
    private final FeedModerationService moderation;
    private final FeedMediaService images;
    @GetMapping("/reports")
    public ResponseEntity<ApiResponse<Page<FeedDto.Report>>> reports(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size, @RequestParam(required = false) String status) {
        return FeedController.response(moderation.reports(admin(), page, size, status), "피드 신고 조회 성공");
    }
    @GetMapping("/reports/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedDto.Report>> report(@PathVariable Long id) { return FeedController.response(moderation.readReport(admin(), id), "피드 신고 상세 조회 성공"); }
    @PatchMapping("/reports/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedDto.Report>> review(@PathVariable Long id, @Valid @RequestBody FeedDto.ReviewReportRequest request) {
        return FeedController.response(moderation.review(admin(), id, request), "피드 신고를 처리했어요.");
    }
    @PatchMapping("/posts/{id:[0-9]+}/visibility")
    public ResponseEntity<ApiResponse<FeedDto.Post>> visibility(@PathVariable Long id, @Valid @RequestBody FeedDto.VisibilityRequest request) {
        return FeedController.response(moderation.visibility(admin(), id, request), "게시물 공개 상태를 변경했어요.");
    }
    @GetMapping("/reports/{reportId:[0-9]+}/images/{imageId:[0-9]+}")
    public ResponseEntity<byte[]> image(@PathVariable Long reportId, @PathVariable Long imageId) {
        return FeedController.imageResponse(images.readEvidence(admin(), reportId, imageId));
    }
    @GetMapping("/audit")
    public ResponseEntity<ApiResponse<Page<FeedDto.Audit>>> audit(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size, @RequestParam(required = false) String action) {
        return FeedController.response(moderation.audit(admin(), page, size, action), "피드 처리 기록 조회 성공");
    }
    private Long admin() { return SecurityUtil.getCurrentMemberId(); }
}
