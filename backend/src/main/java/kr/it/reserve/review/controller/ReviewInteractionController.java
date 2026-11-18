package kr.it.reserve.review.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.dto.ReviewInteractionResponse.*;
import kr.it.reserve.review.service.ReviewInteractions;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/reviews/{id:[0-9]+}")
public class ReviewInteractionController {
    private final ReviewInteractions interactions;
    private final RateLimiter rateLimiter;

    @PutMapping("/like")
    public ApiResponse<Like> like(@PathVariable Long id, @Valid @RequestBody LikeRequest request, HttpServletRequest http) {
        return ApiResponse.success(interactions.setLike(id, writer(http), request.liked()), "좋아요를 반영했어요.");
    }

    @GetMapping("/comments")
    public ResponseEntity<ApiResponse<Page<Comment>>> comments(@PathVariable Long id, @RequestParam(defaultValue = "0") int page) {
        Member viewer = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMember() : null;
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(interactions.list(id, viewer, page), "댓글을 불러왔어요."));
    }

    @PostMapping("/comments")
    public ApiResponse<PostedComment> addComment(@PathVariable Long id, @Valid @RequestBody CommentRequest request, HttpServletRequest http) {
        return ApiResponse.success(interactions.addComment(id, writer(http), request.clientRequestId(), request.content()), "댓글을 작성했어요.");
    }

    @DeleteMapping("/comments/{commentId:[0-9]+}")
    public ApiResponse<CommentCount> deleteComment(@PathVariable Long id, @PathVariable Long commentId, HttpServletRequest http) {
        return ApiResponse.success(interactions.deleteComment(id, commentId, writer(http)), "댓글을 삭제했어요.");
    }

    private Member writer(HttpServletRequest http) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요해요.");
        var policy = RateLimiter.Policy.CHAT_SEND;
        if (!rateLimiter.tryConsume("review-interaction-ip:" + IpExtractor.extract(http), policy)
                || !rateLimiter.tryConsume("review-interaction-member:" + member.getId(), policy)) {
            throw new ReviewException("잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return member;
    }

    public record LikeRequest(@NotNull Boolean liked) { }
    public record CommentRequest(@NotNull UUID clientRequestId, @NotBlank @Size(max = 500) String content) { }
}
