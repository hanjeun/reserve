package kr.it.reserve.feed.dto;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class FeedDto {
    private FeedDto() {}
    public record Configuration(boolean enabled, boolean imageEnabled, int maxImages, long maxImageBytes, int deleteGraceDays) {}
    public enum AvatarSource { ACCOUNT, CUSTOM, NONE }
    public record Profile(String publicId, String nickname, String bio, String avatarUrl, boolean useAccountAvatar, AvatarSource avatarSource) {
        public Profile(String publicId, String nickname, String bio, String avatarUrl, boolean useAccountAvatar) {
            this(publicId, nickname, bio, avatarUrl, useAccountAvatar, useAccountAvatar ? AvatarSource.ACCOUNT : AvatarSource.NONE);
        }
    }
    public record ProfileRequest(@NotBlank @Size(max = 30) String nickname, @Size(max = 160) String bio,
                                 Boolean useAccountAvatar, AvatarSource avatarSource) {
        public ProfileRequest(String nickname, String bio, boolean useAccountAvatar) {
            this(nickname, bio, useAccountAvatar, null);
        }
    }
    public record Image(Long id, String url, int width, int height) implements kr.it.reserve.promotion.dto.NewsImage {}
    public record RegionGroup(String name, long count, List<RegionArea> areas) {}
    public record RegionArea(String name, long count) {}
    public record StoreLink(Long id, String name, boolean reservationEnabled, boolean waitingEnabled) {}
    public record PromotionLink(Long id, String title, String periodStatus) {
        public PromotionLink(Long id, String title) { this(id, title, null); }
    }
    public record News(Long id, String title, String newsType, OffsetDateTime startsAt, OffsetDateTime endsAt,
                       String conditions, String periodStatus, boolean feedEnabled, long revision) {}
    public record Post(Long id, String content, String region, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                       long revision, String state, boolean mine, Profile author, List<Image> images,
                       StoreLink store, PromotionLink promotion, News news) {
        public Post(Long id, String content, String region, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                    long revision, String state, boolean mine, Profile author, List<Image> images, StoreLink store, PromotionLink promotion) {
            this(id, content, region, createdAt, updatedAt, revision, state, mine, author, images, store, promotion, null);
        }
    }
    public record PostRequest(@Size(max = 2000) String content, @Size(max = 50) String region,
                              @Positive Long storeId, @Positive Long promotionId,
                              @Size(max = 6) List<@NotNull @Positive Long> mediaIds,
                              boolean draft, @PositiveOrZero Long revision,
                              @Pattern(regexp = "[0-9a-fA-F\\-]{36}") String clientRequestId) {}
    public record ReportRequest(@NotBlank @Pattern(regexp = "SPAM|ABUSE|PRIVACY|OTHER") String reason,
                                @Size(max = 500) String detail) {}
    public record ReviewReportRequest(@NotBlank @Pattern(regexp = "OPEN|RESOLVED") String status,
                                     boolean hold, @NotBlank(message = "처리 이유를 입력해주세요.") @Size(max = 1000) String note,
                                     @NotNull(message = "확인한 신고 버전이 필요해요.") @PositiveOrZero(message = "신고 버전을 다시 확인해주세요.") Long revision) {}
    public record VisibilityRequest(boolean hidden, @NotBlank @Size(max = 500) String reason,
                                    @NotNull(message = "확인한 게시물 버전이 필요해요.") @PositiveOrZero(message = "게시물 버전을 다시 확인해주세요.") Long revision) {}
    public record Report(Long id, Long postId, String reason, String detail, String status, boolean hold,
                         String note, OffsetDateTime createdAt, String postState, Post post, long revision, Long postRevision) {}
    public record Audit(Long id, Long actorId, String action, Long postId, Long reportId, String reason, OffsetDateTime createdAt, Long promotionId) {}
}
