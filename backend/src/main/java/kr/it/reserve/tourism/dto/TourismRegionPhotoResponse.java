package kr.it.reserve.tourism.dto;

import kr.it.reserve.tourism.entity.TourismRegionPhoto;

import java.time.LocalDateTime;

/** 브라우저에는 검증된 지역 코드용 프록시 주소만 내보내고 원본 관광 사진 URL은 서버에 둔다. */
public record TourismRegionPhotoResponse(
        String region,
        String imageUrl,
        String provider,
        String workTitle,
        String sourceUrl,
        String license,
        String contentId,
        LocalDateTime checkedAt
) {
    public static TourismRegionPhotoResponse from(TourismRegionPhoto photo) {
        return new TourismRegionPhotoResponse(
                photo.getRegionCode(),
                "/api/tourism/region-photos/" + photo.getRegionCode() + "/image",
                photo.getProviderName(),
                photo.getWorkTitle(),
                photo.getSourceUrl(),
                photo.getLicenseType(),
                photo.getContentId(),
                photo.getCheckedAt()
        );
    }
}
