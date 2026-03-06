package com.reserve.community.controller;

import com.reserve.community.dto.CommunityDto;
import com.reserve.community.service.CommunityService;
import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/community")
@RequiredArgsConstructor
public class CommunityApiController {

    private final CommunityService communityService;

    // 게시글 목록 조회 (비로그인 가능)
    @GetMapping("/posts")
    public ApiResponse<Page<CommunityDto.PostResponse>> getPosts(
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(communityService.getPosts(category, page, size), "게시글 목록 조회 성공");
    }

    // 게시글 검색 (비로그인 가능)
    @GetMapping("/posts/search")
    public ApiResponse<Page<CommunityDto.PostResponse>> searchPosts(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(communityService.searchPosts(keyword, page, size), "게시글 검색 성공");
    }

    // 게시글 상세 조회 (비로그인 시 memberId null 전달)
    @GetMapping("/posts/{postId}")
    public ApiResponse<CommunityDto.PostResponse> getPost(@PathVariable Long postId) {
        Long memberId = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        return ApiResponse.success(communityService.getPost(postId, memberId), "게시글 상세 조회 성공");
    }

    // 게시글 작성
    @PostMapping("/posts")
    public ApiResponse<CommunityDto.PostResponse> createPost(@RequestBody CommunityDto.PostRequest request) {
        return ApiResponse.success(communityService.createPost(SecurityUtil.getCurrentMemberId(), request), "게시글이 등록되었습니다.");
    }

    // 게시글 수정
    @PutMapping("/posts/{postId}")
    public ApiResponse<CommunityDto.PostResponse> updatePost(
            @PathVariable Long postId,
            @RequestBody CommunityDto.PostRequest request) {
        return ApiResponse.success(communityService.updatePost(postId, SecurityUtil.getCurrentMemberId(), request), "게시글이 수정되었습니다.");
    }

    // 게시글 삭제
    @DeleteMapping("/posts/{postId}")
    public ApiResponse<Void> deletePost(@PathVariable Long postId) {
        communityService.deletePost(postId, SecurityUtil.getCurrentMemberId());
        return ApiResponse.success(null, "게시글이 삭제되었습니다.");
    }

    // 댓글 목록 조회 (비로그인 시 memberId null 전달)
    @GetMapping("/posts/{postId}/comments")
    public ApiResponse<List<CommunityDto.CommentResponse>> getComments(@PathVariable Long postId) {
        Long memberId = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        return ApiResponse.success(communityService.getComments(postId, memberId), "댓글 목록 조회 성공");
    }

    // 댓글 작성
    @PostMapping("/posts/{postId}/comments")
    public ApiResponse<CommunityDto.CommentResponse> createComment(
            @PathVariable Long postId,
            @RequestBody CommunityDto.CommentRequest request) {
        return ApiResponse.success(communityService.createComment(postId, SecurityUtil.getCurrentMemberId(), request), "댓글이 작성되었습니다.");
    }

    // 댓글 삭제
    @DeleteMapping("/comments/{commentId}")
    public ApiResponse<Void> deleteComment(@PathVariable Long commentId) {
        communityService.deleteComment(commentId, SecurityUtil.getCurrentMemberId());
        return ApiResponse.success(null, "댓글이 삭제되었습니다.");
    }

    // 좋아요 토글
    @PostMapping("/posts/{postId}/like")
    public ApiResponse<Boolean> toggleLike(@PathVariable Long postId) {
        return ApiResponse.success(communityService.toggleLike(postId, SecurityUtil.getCurrentMemberId()), "좋아요 상태 변경 성공");
    }
}