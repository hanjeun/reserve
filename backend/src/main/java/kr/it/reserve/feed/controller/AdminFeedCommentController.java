package kr.it.reserve.feed.controller;

import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.dto.*;
import kr.it.reserve.feed.service.FeedCommentService;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/admin/feed") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class AdminFeedCommentController {
    private final FeedCommentService comments;
    private final FeedMediaService images;
    @GetMapping("/comment-reports/{id:[0-9]+}/images/{image:[0-9]+}")
    public ResponseEntity<byte[]> evidence(@PathVariable Long id, @PathVariable Long image) { return FeedController.imageResponse(images.readCommentEvidence(admin(), id, image)); }
    @GetMapping("/comments/{id:[0-9]+}/images/{image:[0-9]+}")
    public ResponseEntity<byte[]> currentImage(@PathVariable Long id, @PathVariable Long image) { return FeedController.imageResponse(images.readCurrentComment(admin(), id, image)); }
    @GetMapping("/comment-reports")
    public ResponseEntity<ApiResponse<Page<FeedInteractionDto.CommentReport>>> reports(@RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return FeedController.response(comments.reports(admin(), status, page, size), "댓글 신고 조회 성공");
    }
    @GetMapping("/comment-reports/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.CommentReport>> report(@PathVariable Long id) {
        return FeedController.response(comments.readReport(admin(), id), "댓글 신고 상세 조회 성공");
    }
    @PatchMapping("/comment-reports/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.CommentReport>> review(@PathVariable Long id, @Valid @RequestBody FeedDto.ReviewReportRequest request) {
        return FeedController.response(comments.review(admin(), id, request), "댓글 신고를 처리했어요.");
    }
    @GetMapping("/comments/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Comment>> comment(@PathVariable Long id) {
        return FeedController.response(comments.current(admin(), id), "현재 댓글 조회 성공");
    }
    @PatchMapping("/comments/{id:[0-9]+}/visibility")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Comment>> visibility(@PathVariable Long id, @Valid @RequestBody FeedInteractionDto.CommentVisibility request) {
        return FeedController.response(comments.visibility(admin(), id, request), "댓글 공개 상태를 변경했어요.");
    }
    private Long admin() { return SecurityUtil.getCurrentMemberId(); }
}
