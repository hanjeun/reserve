package kr.it.reserve.feed.news.dto;

import jakarta.validation.constraints.*;
import kr.it.reserve.feed.dto.FeedDto;
import java.time.OffsetDateTime;
import java.util.List;

public final class StoreNewsDto {
    private StoreNewsDto() {}
    public record Request(@NotNull @Positive Long storeId, @Size(max = 200) String title,
                          @Size(max = 2000) String content,
                          @NotBlank @Pattern(regexp = "NEWS|NOTICE|EVENT|BENEFIT") String newsType,
                          OffsetDateTime startsAt, OffsetDateTime endsAt, @Size(max = 1000) String conditions,
                          boolean feedEnabled, @Size(max = 6) List<@NotNull @Positive Long> mediaIds,
                          boolean draft, @PositiveOrZero Long revision,
                          @Pattern(regexp = "[0-9a-fA-F\\-]{36}") String clientRequestId,
                          boolean benefitRequested,
                          @Pattern(regexp = "STANDARD|PHOTO|COMPACT") String design) {
        public Request(Long storeId, String title, String content, String newsType, OffsetDateTime startsAt,
                       OffsetDateTime endsAt, String conditions, boolean feedEnabled, List<Long> mediaIds,
                       boolean draft, Long revision, String clientRequestId, boolean benefitRequested) {
            this(storeId, title, content, newsType, startsAt, endsAt, conditions, feedEnabled, mediaIds,
                    draft, revision, clientRequestId, benefitRequested, null);
        }
    }
    public record News(Long id, Long storeId, String storeName, String storeAddress, String storeCategory,
                       String mainImageUrl, String title, String content, String newsType,
                       OffsetDateTime startsAt, OffsetDateTime endsAt, String conditions, String periodStatus,
                       boolean feedEnabled, String state, long revision, Long feedPostId,
                       List<FeedDto.Image> images, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                       String benefitState, OffsetDateTime benefitRequestedAt, OffsetDateTime benefitReviewedAt,
                       String benefitReviewNote, String design) {}
    public record Configuration(boolean enabled, boolean imageEnabled, int maxImages, long maxImageBytes,
                                int deleteGraceDays, boolean benefitApprovalEnabled, boolean benefitDesignEnabled, boolean benefitEventsEnabled) {
        public Configuration(boolean enabled, boolean imageEnabled, int maxImages, long maxImageBytes,
                             int deleteGraceDays, boolean benefitApprovalEnabled) {
            this(enabled, imageEnabled, maxImages, maxImageBytes, deleteGraceDays, benefitApprovalEnabled, false, false);
        }
    }
    public record BenefitReview(@NotNull @PositiveOrZero Long revision, @NotNull Boolean approved,
                               @NotBlank @Size(max = 1000) String note) {}
    public record StoreChoice(Long id, String name, String category, String address, String mainImageUrl,
                              boolean reservationEnabled, boolean waitingEnabled) {}
}
