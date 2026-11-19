package kr.it.reserve.review.service;

import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.dto.ReviewInteractionResponse.*;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewComment;
import kr.it.reserve.review.entity.ReviewLike;
import kr.it.reserve.review.repository.ReviewCommentRepository;
import kr.it.reserve.review.repository.ReviewLikeRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReviewInteractions {
    private final ReviewRepository reviews;
    private final ReviewLikeRepository likes;
    private final ReviewCommentRepository comments;
    private final ReviewAuthorReader profiles;
    private final ReviewMutationGuard mutations;

    public Map<Long, Summary> summaries(Collection<Long> ids, Member viewer) {
        if (ids.isEmpty()) return Map.of();
        var likeCounts = counts(likes.countByReviewIds(ids));
        var commentCounts = counts(comments.countVisibleByReviewIds(ids, LocalDateTime.now()));
        Set<Long> liked = viewer == null ? Set.of() : Set.copyOf(likes.likedReviewIds(viewer.getId(), ids));
        return ids.stream().collect(Collectors.toMap(id -> id, id -> new Summary(
                liked.contains(id), likeCounts.getOrDefault(id, 0L), commentCounts.getOrDefault(id, 0L))));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Like setLike(Long id, Member actor, boolean liked) {
        var writable = writableReview(id, actor);
        Review review = writable.review();
        var existing = likes.findByReview_IdAndMember_Id(id, actor.getId());
        if (liked && existing.isEmpty()) likes.save(new ReviewLike(review, writable.actor()));
        if (!liked) existing.ifPresent(likes::delete);
        return new Like(liked, likes.countByReview_Id(id));
    }

    public Page<Comment> list(Long id, Member viewer, int page) {
        Review review = published(reviews.findById(id));
        var result = comments.findVisible(id, LocalDateTime.now(), PageRequests.bounded(page, 20));
        var authors = profiles.reviewAuthors(result.stream()
                .map(row -> row.getMember().getId()).distinct().toList(), viewer);
        return result.map(row -> {
            Long memberId = row.getMember().getId();
            boolean reviewer = review.getMember().getId().equals(memberId);
            String alias = reviewer ? review.getAuthorAlias() : null;
            var profile = alias == null ? authors.get(memberId) : null;
            String name = alias != null ? alias : profile == null ? ReviewResponse.FALLBACK_NAME : profile.nickname();
            return new Comment(row.getId(), row.getContent(), row.getCreatedAt().atOffset(ZoneOffset.UTC),
                    viewer != null && memberId.equals(viewer.getId()), name, profile == null ? null : profile.publicId(),
                    profile == null ? null : profile.avatarUrl());
        });
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PostedComment addComment(Long id, Member actor, UUID clientRequestId, String content) {
        var writable = writableReview(id, actor);
        Review review = writable.review();
        String requestId = clientRequestId.toString();
        ReviewComment comment = comments.findByReview_IdAndMember_IdAndClientRequestId(id, actor.getId(), requestId)
                .orElseGet(() -> comments.save(new ReviewComment(review, writable.actor(), requestId, content.strip(), LocalDateTime.now())));
        return new PostedComment(comments.countVisible(id, LocalDateTime.now()), comment.getId());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public CommentCount deleteComment(Long id, Long commentId, Member actor) {
        writableReview(id, actor);
        comments.findByIdAndReview_Id(commentId, id).ifPresent(comment -> {
            if (!actor.getId().equals(comment.getMember().getId())) {
                throw new ReviewException("본인의 댓글만 삭제할 수 있어요.", HttpStatus.FORBIDDEN);
            }
            comments.delete(comment);
        });
        return new CommentCount(comments.countVisible(id, LocalDateTime.now()));
    }

    private static Map<Long, Long> counts(List<ReviewLikeRepository.Count> rows) {
        Map<Long, Long> result = new HashMap<>();
        for (var row : rows) result.put(row.getReviewId(), row.getTotal());
        return result;
    }

    private WritableReview writableReview(Long id, Member actor) {
        Member current = mutations.lockAuthor(actor.getId());
        if (current.isDeleted() || current.isSuspended() || !current.isTermsAgreed()) {
            throw new ReviewException("현재 리뷰에 참여할 수 없어요.", HttpStatus.FORBIDDEN);
        }
        return new WritableReview(published(mutations.lockInteractionReview(id)), current);
    }

    private record WritableReview(Review review, Member actor) { }

    private static Review published(Optional<Review> review) {
        return review.filter(Review::isPublished)
                .orElseThrow(() -> new ReviewException("리뷰를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }
}
