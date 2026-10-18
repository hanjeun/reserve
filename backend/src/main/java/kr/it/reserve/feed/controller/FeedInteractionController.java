package kr.it.reserve.feed.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.*;
import kr.it.reserve.feed.service.*;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/feed") @RequiredArgsConstructor
public class FeedInteractionController {
    private final FeedInteractionPolicy policy;
    private final ContentLikeService likes;
    private final FeedCommentService comments;
    private final FeedMediaService images;
    private final FeedNotificationService notifications;
    private final RateLimiter limiter;
    @GetMapping("/interactions/config")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Configuration>> config() {
        var media = images.config();
        return FeedController.response(new FeedInteractionDto.Configuration(policy.isEnabled(), 1000, 1, policy.isNewsEnabled(), policy.isEnabled() && media.imageEnabled(), media.maxImages(), media.maxImageBytes(), policy.isEnabled(), policy.isEnabled()), "좋아요·댓글 설정 조회 성공");
    }
    @GetMapping("/likes/{type:POST|NEWS|COMMENT}/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Status>> status(@PathVariable String type, @PathVariable Long id) {
        return FeedController.response(likes.status(type, id, viewer()), "좋아요 조회 성공");
    }
    @PutMapping("/likes/{type:POST|NEWS|COMMENT}/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Status>> like(@PathVariable String type, @PathVariable Long id,
            @Valid @RequestBody FeedInteractionDto.LikeRequest request, HttpServletRequest http) {
        Long member = writer(http, RateLimiter.Policy.CHAT_SEND); return FeedController.response(likes.set(member, type, id, request.liked()), "좋아요를 반영했어요.");
    }
    @GetMapping("/me/likes")
    public ResponseEntity<ApiResponse<Page<FeedInteractionDto.LikedItem>>> mine(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "ALL") String type) {
        return FeedController.response(likes.mine(member(), type, page, size), "내 좋아요 조회 성공");
    }
    @GetMapping("/posts/{id:[0-9]+}/comments")
    public ResponseEntity<ApiResponse<Page<FeedInteractionDto.Comment>>> comments(@PathVariable Long id, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return FeedController.response(comments.list(id, viewer(), page, size), "댓글 조회 성공");
    }
    @GetMapping("/comments/{id:[0-9]+}/replies")
    public ResponseEntity<ApiResponse<Page<FeedInteractionDto.Comment>>> replies(@PathVariable Long id, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return FeedController.response(comments.replies(id, viewer(), page, size), "답글 조회 성공");
    }
    @GetMapping("/comments/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Comment>> comment(@PathVariable Long id) { return FeedController.response(comments.readPublic(id, viewer()), "댓글 조회 성공"); }
    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<Page<FeedInteractionDto.Notification>>> notifications(@RequestParam(defaultValue = "false") boolean unread, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return FeedController.response(notifications.list(member(), unread, page, size), "피드 알림 조회 성공");
    }
    @GetMapping("/notifications/count")
    public ResponseEntity<ApiResponse<FeedInteractionDto.NotificationCount>> notificationCount() { return FeedController.response(notifications.count(member()), "안 읽은 알림 조회 성공"); }
    @PutMapping("/notifications/{id:[0-9]+}/read")
    public ResponseEntity<ApiResponse<Void>> readNotification(@PathVariable Long id) { notifications.read(member(), id); return FeedController.response(null, "알림을 읽었어요."); }
    @PutMapping("/notifications/read-all")
    public ResponseEntity<ApiResponse<Void>> readAllNotifications() { notifications.readAll(member()); return FeedController.response(null, "알림을 모두 읽었어요."); }
    @PostMapping("/posts/{id:[0-9]+}/comments")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Comment>> create(@PathVariable Long id, @Valid @RequestBody FeedInteractionDto.CommentRequest request, HttpServletRequest http) {
        return FeedController.response(comments.create(writer(http, RateLimiter.Policy.CHAT_SEND), id, request), "댓글을 작성했어요.");
    }
    @PutMapping("/comments/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedInteractionDto.Comment>> edit(@PathVariable Long id, @Valid @RequestBody FeedInteractionDto.CommentRequest request, HttpServletRequest http) {
        return FeedController.response(comments.edit(writer(http, RateLimiter.Policy.CHAT_SEND), id, request), "댓글을 수정했어요.");
    }
    @DeleteMapping("/comments/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id, HttpServletRequest http) {
        comments.delete(writer(http, RateLimiter.Policy.CHAT_SEND), id); return FeedController.response(null, "댓글을 삭제했어요.");
    }
    @PostMapping("/comments/{id:[0-9]+}/reports")
    public ResponseEntity<ApiResponse<Void>> report(@PathVariable Long id, @Valid @RequestBody FeedDto.ReportRequest request, HttpServletRequest http) {
        comments.report(writer(http, RateLimiter.Policy.CHAT_REPORT), id, request); return FeedController.response(null, "댓글 신고를 접수했어요.");
    }
    private Long member() { return SecurityUtil.getCurrentMember("로그인이 필요해요.").getId(); }
    private Long viewer() { return SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null; }
    private Long writer(HttpServletRequest http, RateLimiter.Policy policy) {
        Long member = member();
        if (!limiter.tryConsume("feed-interaction-" + policy.name() + "-ip:" + IpExtractor.extract(http), policy)
                || !limiter.tryConsume("feed-interaction-" + policy.name() + "-member:" + member, policy)) {
            throw new FeedException("잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return member;
    }
}
