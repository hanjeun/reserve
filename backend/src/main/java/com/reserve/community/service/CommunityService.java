package com.reserve.community.service;

import com.reserve.community.dto.CommunityDto;
import com.reserve.community.entity.CommunityComment;
import com.reserve.community.entity.CommunityPost;
import com.reserve.community.entity.PostLike;
import com.reserve.community.repository.CommunityCommentRepository;
import com.reserve.community.repository.CommunityPostRepository;
import com.reserve.community.repository.PostLikeRepository;
import com.reserve.global.error.CommunityException;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommunityService {

    private final CommunityPostRepository postRepository;
    private final CommunityCommentRepository commentRepository;
    private final PostLikeRepository postLikeRepository;
    private final MemberRepository memberRepository;

    // 공통 페이징 생성
    private Pageable getPageable(int page, int size) {
        return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    public Page<CommunityDto.PostResponse> getPosts(String category, int page, int size) {
        Pageable pageable = getPageable(page, size);

        Page<CommunityPost> postPage = (category == null || category.equals("ALL"))
                ? postRepository.findAll(pageable)
                : postRepository.findByCategory(CommunityPost.PostCategory.valueOf(category), pageable);

        return toPostResponsePage(postPage, pageable);
    }

    public Page<CommunityDto.PostResponse> searchPosts(String keyword, int page, int size) {
        Page<CommunityPost> postPage = postRepository.searchByTitleOrContent(keyword, getPageable(page, size));
        return toPostResponsePage(postPage, getPageable(page, size));
    }

    /**
     * Page<CommunityPost> → Page<PostResponse> 변환
     * commentCount를 IN 쿼리 1번으로 일괄 조회 (comments 컬렉션 LAZY 로딩 N+1 방지)
     */
    private Page<CommunityDto.PostResponse> toPostResponsePage(Page<CommunityPost> postPage, Pageable pageable) {
        List<CommunityPost> posts = postPage.getContent();
        if (posts.isEmpty()) return postPage.map(p -> CommunityDto.PostResponse.fromEntity(p, 0));

        List<Long> postIds = posts.stream().map(CommunityPost::getId).collect(Collectors.toList());
        Map<Long, Long> commentCountMap = postRepository.countCommentsByPostIds(postIds).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));

        List<CommunityDto.PostResponse> responses = posts.stream()
                .map(p -> CommunityDto.PostResponse.fromEntity(p, commentCountMap.getOrDefault(p.getId(), 0L).intValue()))
                .collect(Collectors.toList());

        return new PageImpl<>(responses, pageable, postPage.getTotalElements());
    }

    @Transactional
    public CommunityDto.PostResponse getPost(Long postId, Long memberId) {
        CommunityPost post = findPostOrThrow(postId);
        post.incrementViewCount();

        boolean isLiked = memberId != null && postLikeRepository.existsByPostIdAndMemberId(postId, memberId);
        return CommunityDto.PostResponse.fromEntity(post, memberId != null ? memberId : -1L, isLiked);
    }

    @Transactional
    public CommunityDto.PostResponse createPost(Long memberId, CommunityDto.PostRequest request) {
        Member member = findMemberOrThrow(memberId);

        CommunityPost post = CommunityPost.builder()
                .author(member)
                .title(request.getTitle())
                .content(request.getContent())
                .category(CommunityPost.PostCategory.valueOf(request.getCategory()))
                .build();

        return CommunityDto.PostResponse.fromEntity(postRepository.save(post), memberId, false);
    }

    @Transactional
    public CommunityDto.PostResponse updatePost(Long postId, Long memberId, CommunityDto.PostRequest request) {
        CommunityPost post = findPostOrThrow(postId);
        validateAuthor(post.getAuthor().getId(), memberId, "수정");

        post.setTitle(request.getTitle());
        post.setContent(request.getContent());
        post.setCategory(CommunityPost.PostCategory.valueOf(request.getCategory()));

        return CommunityDto.PostResponse.fromEntity(post, memberId, isLiked(postId, memberId));
    }

    @Transactional
    public void deletePost(Long postId, Long memberId) {
        CommunityPost post = findPostOrThrow(postId);
        validateAuthor(post.getAuthor().getId(), memberId, "삭제");
        postRepository.delete(post);
    }

    public List<CommunityDto.CommentResponse> getComments(Long postId, Long memberId) {
        Long userId = memberId != null ? memberId : -1L;
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId).stream()
                .map(comment -> CommunityDto.CommentResponse.fromEntity(comment, userId))
                .collect(Collectors.toList());
    }

    @Transactional
    public CommunityDto.CommentResponse createComment(Long postId, Long memberId, CommunityDto.CommentRequest request) {
        CommunityPost post = findPostOrThrow(postId);
        Member member = findMemberOrThrow(memberId);

        CommunityComment comment = CommunityComment.builder()
                .post(post)
                .author(member)
                .content(request.getContent())
                .build();

        return CommunityDto.CommentResponse.fromEntity(commentRepository.save(comment), memberId);
    }

    @Transactional
    public void deleteComment(Long commentId, Long memberId) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new CommunityException("댓글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        validateAuthor(comment.getAuthor().getId(), memberId, "삭제");
        commentRepository.delete(comment);
    }

    @Transactional
    public boolean toggleLike(Long postId, Long memberId) {
        CommunityPost post = findPostOrThrow(postId);
        Member member = findMemberOrThrow(memberId);

        return postLikeRepository.findByPostIdAndMemberId(postId, memberId)
                .map(like -> {
                    postLikeRepository.delete(like);
                    post.decrementLikeCount();
                    return false;
                })
                .orElseGet(() -> {
                    postLikeRepository.save(PostLike.builder().post(post).member(member).build());
                    post.incrementLikeCount();
                    return true;
                });
    }

    public boolean isLiked(Long postId, Long memberId) {
        return memberId != null && postLikeRepository.existsByPostIdAndMemberId(postId, memberId);
    }

    // --- Private Helper Methods ---

    private CommunityPost findPostOrThrow(Long postId) {
        return postRepository.findById(postId)
                .orElseThrow(() -> new CommunityException("게시글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private Member findMemberOrThrow(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new CommunityException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private void validateAuthor(Long authorId, Long memberId, String action) {
        if (!authorId.equals(memberId)) {
            throw new CommunityException("게시글 작성자만 " + action + "할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
    }
}