package kr.it.reserve.feed.dto;

import jakarta.validation.constraints.*;
import kr.it.reserve.promotion.dto.PromotionDto;
import java.time.OffsetDateTime;
import java.util.List;

public final class FeedInteractionDto {
    private FeedInteractionDto() {}
    public record Configuration(boolean enabled, int commentMaxLength, int maxReplyDepth, boolean newsEnabled,
                                boolean commentPhotosEnabled, int maxImages, long maxImageBytes, boolean notificationsEnabled, boolean commentLikesEnabled) {
        public Configuration(boolean enabled, int commentMaxLength, int maxReplyDepth, boolean newsEnabled) {
            this(enabled, commentMaxLength, maxReplyDepth, newsEnabled, false, 6, 7L * 1024 * 1024, false, false);
        }
    }
    public record LikeRequest(@NotNull Boolean liked) {}
    public record Status(String type, Long targetId, boolean liked, long likeCount, long commentCount) {}
    public record LikedItem(Long id, String type, Long targetId, OffsetDateTime likedAt, boolean available, FeedDto.Post post, PromotionDto.PublicPromotionDetailResponse news, Comment comment) {
        public LikedItem(Long id, String type, Long targetId, OffsetDateTime likedAt, boolean available, FeedDto.Post post, PromotionDto.PublicPromotionDetailResponse news) {
            this(id, type, targetId, likedAt, available, post, news, null);
        }
    }
    public record Comment(Long id, Long postId, Long parentId, String content, FeedDto.Profile author,
                          String state, boolean mine, long revision, long replyCount, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                          List<FeedDto.Image> images, boolean liked, long likeCount) {
        public Comment { images = images == null ? List.of() : List.copyOf(images); }
        public Comment(Long id, Long postId, Long parentId, String content, FeedDto.Profile author, String state, boolean mine,
                       long revision, long replyCount, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
            this(id, postId, parentId, content, author, state, mine, revision, replyCount, createdAt, updatedAt, List.of(), false, 0);
        }
    }
    public record CommentRequest(@Size(max = 1000) String content, @Positive Long parentId,
                                 @PositiveOrZero Long revision, @Pattern(regexp = "[0-9a-fA-F\\-]{36}") String clientRequestId,
                                 @Size(max = 6) List<@Positive Long> mediaIds) {
        public CommentRequest(String content, Long parentId, Long revision, String clientRequestId) { this(content, parentId, revision, clientRequestId, null); }
    }
    public record CommentVisibility(boolean hidden, @NotBlank @Size(max = 500) String reason, @PositiveOrZero Long revision) {}
    public record CommentReport(Long id, Long commentId, Long postId, String reason, String detail, String status,
                                boolean hold, String note, OffsetDateTime createdAt, Comment comment, long revision) {}
    public record Notification(Long id, String kind, Long postId, Long commentId, FeedDto.Profile actor, boolean read, OffsetDateTime createdAt) {}
    public record NotificationCount(long unread) {}
}
