package kr.it.reserve.tourism.controller;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.tourism.dto.TourismRegionPhotoResponse;
import kr.it.reserve.tourism.service.TourismRegionPhotoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/** 공개 읽기 전용 지역 사진 API. 원본 URL과 서비스 키는 브라우저에 내보내지 않는다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/tourism/region-photos")
public class TourismRegionPhotoController {

    private static final int MAX_REGIONS_PER_REQUEST = 6;

    private final TourismRegionPhotoService tourismRegionPhotoService;
    private final RateLimiter rateLimiter;

    @GetMapping
    public ResponseEntity<ApiResponse<List<TourismRegionPhotoResponse>>> list(
            @RequestParam(name = "regions") List<String> regions,
            HttpServletRequest request) {
        if (regions.size() > MAX_REGIONS_PER_REQUEST) {
            return ResponseEntity.badRequest().body(ApiResponse.error("한 번에 최대 6개 지역만 조회할 수 있습니다."));
        }
        if (!rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.TOURISM_REGION_PHOTO)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("지역 사진 조회가 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                tourismRegionPhotoService.findRegionPhotos(regions), "지역 대표 사진 조회 성공"));
    }

    @GetMapping("/catalog")
    public ResponseEntity<ApiResponse<List<TourismRegionPhotoResponse>>> catalog(HttpServletRequest request) {
        if (!rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.TOURISM_REGION_PHOTO)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("지역 사진 조회가 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }
        return ResponseEntity.ok(ApiResponse.success(
                tourismRegionPhotoService.catalog(), "지역 사진 출처 목록 조회 성공"));
    }

    @GetMapping("/{region}/image")
    public ResponseEntity<byte[]> image(@PathVariable String region, HttpServletRequest request) {
        if (!rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.TOURISM_REGION_PHOTO)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return tourismRegionPhotoService.loadImage(region)
                .map(image -> ResponseEntity.ok()
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                        .contentType(image.contentType())
                        .body(image.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
