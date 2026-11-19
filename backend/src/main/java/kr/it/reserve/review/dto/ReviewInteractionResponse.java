package kr.it.reserve.review.dto;

import java.time.OffsetDateTime;

public final class ReviewInteractionResponse {
    private ReviewInteractionResponse() { }

    public record Summary(boolean liked, long likeCount, long commentCount) {
        public static final Summary EMPTY = new Summary(false, 0, 0);
    }

    public record Like(boolean liked, long likeCount) { }

    public record Comment(Long id, String content, OffsetDateTime createdAt, boolean mine,
                          String authorName, String authorPublicId, String authorAvatarUrl) { }

    public record PostedComment(long commentCount, Long commentId) { }

    public record CommentCount(long commentCount) { }
}
