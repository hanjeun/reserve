package kr.it.reserve.feed.news.controller;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.feed.service.FeedModerationService;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.Page;

@RestController @RequestMapping("/api/admin/promotions") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class AdminStoreNewsController {
    private final FeedModerationService moderation;
    private final StoreNewsService news;
    private final FeedMediaService images;
    private final RateLimiter limiter;
    @GetMapping("/applications")
    public ResponseEntity<ApiResponse<Page<StoreNewsDto.News>>> applications(@RequestParam(defaultValue = "PENDING") String state,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return response(news.applications(SecurityUtil.getCurrentMemberId(), state, page, size), "혜택 신청 목록 조회 성공");
    }
    @GetMapping("/applications/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<StoreNewsDto.News>> application(@PathVariable Long id) {
        return response(news.application(SecurityUtil.getCurrentMemberId(), id), "혜택 신청 조회 성공");
    }
    @PatchMapping("/applications/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<StoreNewsDto.News>> review(@PathVariable Long id, @Valid @RequestBody StoreNewsDto.BenefitReview request) {
        return response(news.reviewBenefit(SecurityUtil.getCurrentMemberId(), id, request), "혜택 심사를 저장했어요.");
    }
    @GetMapping("/{id:[0-9]+}/images/{imageId:[0-9]+}")
    public ResponseEntity<byte[]> image(@PathVariable Long id, @PathVariable Long imageId, HttpServletRequest http) {
        if (!limiter.tryConsume("feed-image-read:" + IpExtractor.extract(http), RateLimiter.Policy.AD_METRIC)) {
            throw new FeedException("잠시 후 사진을 다시 불러와주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        var image = images.readBenefitApplication(SecurityUtil.getCurrentMemberId(), id, imageId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")
                .header("X-Content-Type-Options", "nosniff").header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=benefit-photo." + ("image/png".equals(image.contentType()) ? "png" : "jpg"))
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
    @PatchMapping("/{id:[0-9]+}/visibility")
    public ResponseEntity<ApiResponse<FeedDto.Post>> visibility(@PathVariable Long id, @Valid @RequestBody FeedDto.VisibilityRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")
                .body(ApiResponse.success(moderation.visibilityNews(SecurityUtil.getCurrentMemberId(), id, request), "가게 소식 공개 상태를 변경했어요."));
    }
    private <T> ResponseEntity<ApiResponse<T>> response(T data, String message) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache").body(ApiResponse.success(data, message));
    }
}
