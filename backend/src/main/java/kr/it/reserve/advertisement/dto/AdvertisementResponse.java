package kr.it.reserve.advertisement.dto;

import kr.it.reserve.advertisement.entity.Advertisement;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class AdvertisementResponse {

    private Long id;
    private Long storeId;
    private String storeName;
    private String adType;
    private List<String> imageUrls;
    private String title;
    private String description;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer amount;
    private String status;
    private String suspendReason;
    private LocalDateTime createdAt;

    public static AdvertisementResponse fromEntity(Advertisement ad) {
        return AdvertisementResponse.builder()
                .id(ad.getId())
                .storeId(ad.getStore().getId())
                .storeName(ad.getStore().getName())
                .adType(ad.getAdType().name())
                .imageUrls(ad.getImageUrlList())
                .title(ad.getTitle())
                .description(ad.getDescription())
                .startDate(ad.getStartDate())
                .endDate(ad.getEndDate())
                .amount(ad.getAmount())
                .status(ad.getStatus().name())
                .suspendReason(ad.getSuspendReason())
                .createdAt(ad.getCreatedAt())
                .build();
    }
}
