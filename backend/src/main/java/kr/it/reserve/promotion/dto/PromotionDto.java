package kr.it.reserve.promotion.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import lombok.*;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class PromotionDto {

    public static final int PUBLIC_EXCERPT_LENGTH = 160;

    private PromotionDto() {
    }

    /** 공개 목록에는 작성자·임의 홍보 이미지·긴 본문을 포함하지 않는다. */
    @Getter
    @Setter
    @Builder
    public static class PublicPromotionSummaryResponse {
        private Long id;
        private Long storeId;
        private String storeName;
        private String storeAddress;
        private String storeCategory;
        private String mainImageUrl;
        private String title;
        private String excerpt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private String newsType;
        private String design;
        private OffsetDateTime startsAt;
        private OffsetDateTime endsAt;
        private String conditions;
        private String periodStatus;
        private String state;
        private long revision;
        private Long feedPostId;
        private boolean feedEnabled;
        private boolean benefitVisible;
        @Builder.Default private List<? extends NewsImage> images = List.of();

        public static PublicPromotionSummaryResponse fromEntity(Promotion promotion) {
            return PublicPromotionSummaryResponse.builder()
                    .id(promotion.getId())
                    .storeId(promotion.getStore().getId())
                    .storeName(promotion.getStore().getName())
                    .storeAddress(promotion.getStore().getAddress())
                    .storeCategory(promotion.getStore().getCategory())
                    .mainImageUrl(promotion.getStore().getMainImageUrl())
                    .title(promotion.getTitle())
                    .excerpt(plainTextExcerpt(promotion.getContent()))
                    .createdAt(promotion.getCreatedAt())
                    .updatedAt(promotion.getUpdatedAt())
                    .newsType(promotion.getNewsType().name())
                    .design(promotion.getDesign() == null ? "STANDARD" : promotion.getDesign().name())
                    .startsAt(StoreNewsPolicy.offset(promotion.getStartsAt()))
                    .endsAt(StoreNewsPolicy.offset(promotion.getEndsAt()))
                    .conditions(promotion.getConditions())
                    .periodStatus(StoreNewsPolicy.period(promotion, StoreNewsPolicy.now()))
                    .state(promotion.getState().name()).revision(promotion.getRevision())
                    .feedPostId(null)
                    .feedEnabled(false)
                    .benefitVisible(StoreNewsPolicy.publicBenefit(promotion))
                    .build();
        }

        private static String plainTextExcerpt(String content) {
            if (content == null) return "";
            String text = content.strip().replaceAll("\\s+", " ");
            if (text.codePointCount(0, text.length()) <= PUBLIC_EXCERPT_LENGTH) return text;
            int end = text.offsetByCodePoints(0, PUBLIC_EXCERPT_LENGTH - 1);
            return text.substring(0, end) + "…";
        }
    }

    /** 본문은 원문 문자열이다. 클라이언트는 HTML이 아닌 텍스트로만 렌더한다. */
    @Getter
    @Setter
    @Builder
    public static class PublicPromotionDetailResponse {
        private Long id;
        private Long storeId;
        private String storeName;
        private String storeAddress;
        private String storeCategory;
        private String mainImageUrl;
        private String title;
        private String content;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private String newsType;
        private String design;
        private OffsetDateTime startsAt;
        private OffsetDateTime endsAt;
        private String conditions;
        private String periodStatus;
        private String state;
        private long revision;
        private Long feedPostId;
        private boolean feedEnabled;
        private boolean benefitVisible;
        private boolean reservationEnabled;
        private boolean waitingEnabled;
        @Builder.Default private List<? extends NewsImage> images = List.of();

        public static PublicPromotionDetailResponse fromEntity(Promotion promotion) {
            return PublicPromotionDetailResponse.builder()
                    .id(promotion.getId())
                    .storeId(promotion.getStore().getId())
                    .storeName(promotion.getStore().getName())
                    .storeAddress(promotion.getStore().getAddress())
                    .storeCategory(promotion.getStore().getCategory())
                    .mainImageUrl(promotion.getStore().getMainImageUrl())
                    .title(promotion.getTitle())
                    .content(promotion.getContent())
                    .createdAt(promotion.getCreatedAt())
                    .updatedAt(promotion.getUpdatedAt())
                    .newsType(promotion.getNewsType().name())
                    .design(promotion.getDesign() == null ? "STANDARD" : promotion.getDesign().name())
                    .startsAt(StoreNewsPolicy.offset(promotion.getStartsAt()))
                    .endsAt(StoreNewsPolicy.offset(promotion.getEndsAt()))
                    .conditions(promotion.getConditions())
                    .periodStatus(StoreNewsPolicy.period(promotion, StoreNewsPolicy.now()))
                    .state(promotion.getState().name()).revision(promotion.getRevision())
                    .feedPostId(null)
                    .feedEnabled(false)
                    .benefitVisible(StoreNewsPolicy.publicBenefit(promotion))
                    .reservationEnabled(promotion.getStore().isReservationEnabled())
                    .waitingEnabled(promotion.getStore().resolveWaitingIntakeMode() != WaitingIntakeMode.OFF)
                    .build();
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PromotionRequest {
        @NotNull @Positive
        private Long storeId; // 홍보할 가게 ID
        @NotBlank @Size(max = 200)
        private String title;
        @NotBlank @Size(max = 2000)
        private String content;
        @NotBlank @Pattern(regexp = "RESTAURANT|CAFE|BEAUTY|ACTIVITY|ETC")
        private String category;
        @Size(max = 500)
        private String imageUrl;
        @Size(max = 500)
        private String specialMenu; // 특색 메뉴
        @Size(max = 2000)
        private String storyHistory; // 가게 역사/스토리
        @Size(max = 500)
        private String tags;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PromotionResponse {
        private Long id;
        private Long storeId;
        private String storeName;
        private String storeAddress;
        private String storeCategory;
        private String title;
        private String content;
        private String category;
        private String categoryDisplayName;
        private String imageUrl;
        private String specialMenu;
        private String storyHistory;
        private String tags;
        private Integer viewCount;
        private Integer likeCount;
        private String memberName;
        private Long memberId;
        private String createdAt;
        private String updatedAt;

        public static PromotionResponse fromEntity(Promotion promotion) {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            boolean deleted = promotion.getState() == Promotion.State.DELETED;
            boolean canonicalNews = promotion.getNewsPost() != null;

            return PromotionResponse.builder()
                    .id(promotion.getId())
                    .storeId(promotion.getStore().getId())
                    .storeName(promotion.getStore().getName())
                    .storeAddress(promotion.getStore().getAddress())
                    .storeCategory(promotion.getStore().getCategory())
                    .title(deleted ? "삭제한 소식" : promotion.getTitle())
                    .content(deleted ? "" : promotion.getContent())
                    .category(promotion.getCategory().name())
                    .categoryDisplayName(promotion.getCategory().getDisplayName())
                    .imageUrl(deleted ? null : promotion.getImageUrl())
                    .specialMenu(deleted ? null : promotion.getSpecialMenu())
                    .storyHistory(deleted ? null : promotion.getStoryHistory())
                    .tags(deleted ? null : promotion.getTags())
                    .viewCount(promotion.getViewCount())
                    .likeCount(promotion.getLikeCount())
                    .memberName(canonicalNews ? promotion.getNewsPost().getProfile().getNickname() : promotion.getMember().getName())
                    .memberId(canonicalNews ? null : promotion.getMember().getId())
                    .createdAt(promotion.getCreatedAt().format(formatter))
                    .updatedAt(promotion.getUpdatedAt().format(formatter))
                    .build();
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class StoreSimpleResponse {
        private Long id;
        private String name;
        private String category;
        private String address;
        private String phone;
        private String mainImageUrl;
    }
}
