package kr.it.reserve.promotion.dto;

import kr.it.reserve.promotion.entity.Promotion;
import lombok.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class PromotionDto {

    public static final int PUBLIC_EXCERPT_LENGTH = 160;

    /** 공개 목록에는 작성자·임의 홍보 이미지·긴 본문을 포함하지 않는다. */
    @Getter
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
                    .build();
        }
    }

    /** 본문은 원문 문자열이다. 클라이언트는 HTML이 아닌 텍스트로만 렌더한다. */
    @Getter
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
                    .build();
        }
    }

    private static String plainTextExcerpt(String content) {
        if (content == null) return "";
        String text = content.strip().replaceAll("\\s+", " ");
        if (text.codePointCount(0, text.length()) <= PUBLIC_EXCERPT_LENGTH) return text;
        int end = text.offsetByCodePoints(0, PUBLIC_EXCERPT_LENGTH - 1);
        return text.substring(0, end) + "…";
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PromotionRequest {
        private Long storeId; // 홍보할 가게 ID
        private String title;
        private String content;
        private String category;
        private String imageUrl;
        private String specialMenu; // 특색 메뉴
        private String storyHistory; // 가게 역사/스토리
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

            return PromotionResponse.builder()
                    .id(promotion.getId())
                    .storeId(promotion.getStore().getId())
                    .storeName(promotion.getStore().getName())
                    .storeAddress(promotion.getStore().getAddress())
                    .storeCategory(promotion.getStore().getCategory())
                    .title(promotion.getTitle())
                    .content(promotion.getContent())
                    .category(promotion.getCategory().name())
                    .categoryDisplayName(promotion.getCategory().getDisplayName())
                    .imageUrl(promotion.getImageUrl())
                    .specialMenu(promotion.getSpecialMenu())
                    .storyHistory(promotion.getStoryHistory())
                    .tags(promotion.getTags())
                    .viewCount(promotion.getViewCount())
                    .likeCount(promotion.getLikeCount())
                    .memberName(promotion.getMember().getName())
                    .memberId(promotion.getMember().getId())
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
