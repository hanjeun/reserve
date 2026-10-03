package kr.it.reserve.tourism.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 한국관광공사 API에서 공공누리 제1유형으로 확인된 시도 대표 사진의 카탈로그. */
@Getter
@Entity
@Table(name = "tourism_region_photo")
@NoArgsConstructor
public class TourismRegionPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "tourism_region_photo_id")
    private Long id;

    @Column(name = "region_code", nullable = false, unique = true, length = 12)
    private String regionCode;

    @Column(name = "content_id", nullable = false, length = 64)
    private String contentId;

    @Column(name = "provider_name", nullable = false, length = 160)
    private String providerName;

    @Column(name = "work_title", nullable = false, length = 500)
    private String workTitle;

    @Column(name = "image_url", nullable = false, length = 2000)
    private String imageUrl;

    @Column(name = "source_url", nullable = false, length = 2000)
    private String sourceUrl;

    @Column(name = "license_type", nullable = false, length = 64)
    private String licenseType;

    @Column(name = "checked_at", nullable = false)
    private LocalDateTime checkedAt;

    public TourismRegionPhoto(String regionCode, PhotoDetails details) {
        refresh(regionCode, details);
    }

    public void refresh(String regionCode, PhotoDetails details) {
        this.regionCode = regionCode;
        this.contentId = details.contentId();
        this.providerName = details.providerName();
        this.workTitle = details.workTitle();
        this.imageUrl = details.imageUrl();
        this.sourceUrl = details.sourceUrl();
        this.licenseType = details.licenseType();
        this.checkedAt = details.checkedAt();
    }

    /** 원본 이미지와 출처·권리 확인 시점을 함께 갱신하는 카탈로그 정보. */
    public record PhotoDetails(
            String contentId, String providerName, String workTitle, String imageUrl,
            String sourceUrl, String licenseType, LocalDateTime checkedAt) {}
}
