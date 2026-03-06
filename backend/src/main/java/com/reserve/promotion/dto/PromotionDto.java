package com.reserve.promotion.dto;

import com.reserve.promotion.entity.Promotion;
import lombok.*;

import java.time.format.DateTimeFormatter;

public class PromotionDto {

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
