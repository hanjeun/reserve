package kr.it.reserve.feed.news.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.service.PromotionService;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.news.service.StoreNewsEvents;
import kr.it.reserve.feed.service.FeedModerationService;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.IpExtractor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
@RequiredArgsConstructor
public class PromotionApiController {

    private final PromotionService promotionService;
    private final StoreNewsService news;
    private final FeedModerationService moderation;
    private final RateLimiter limiter;
    private final StoreNewsEvents events;
    @GetMapping(value = "/public/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(HttpServletRequest http, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Accel-Buffering", "no");
        String address = IpExtractor.extract(http);
        if (!limiter.tryConsume("news-events-public:" + address, RateLimiter.Policy.AD_METRIC)) {
            throw new FeedException("잠시 후 다시 연결해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return events.subscribePublic(address);
    }

    @GetMapping("/public")
    public ResponseEntity<ApiResponse<Page<PromotionDto.PublicPromotionSummaryResponse>>> getPublicPromotions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size, @RequestParam(required = false) Long storeId,
            @RequestParam(required = false) String newsType, @RequestParam(defaultValue = "ONGOING") String period) {
        return publicResponse(news.publicList(page, size, storeId, newsType, period), "가게 소식 목록 조회 성공");
    }

    @GetMapping("/public/{promotionId}")
    public ResponseEntity<ApiResponse<PromotionDto.PublicPromotionDetailResponse>> getPublicPromotion(
            @PathVariable Long promotionId) {
        return publicResponse(news.publicDetail(promotionId), "가게 소식 상세 조회 성공");
    }

    @PostMapping("/public/{promotionId:[0-9]+}/reports")
    public ResponseEntity<ApiResponse<Void>> report(@PathVariable Long promotionId, @Valid @RequestBody FeedDto.ReportRequest request) {
        Long memberId = SecurityUtil.getCurrentMember("로그인이 필요해요.").getId();
        if (!limiter.tryConsume("feed-report-member:" + memberId, RateLimiter.Policy.CHAT_REPORT)) {
            throw new FeedException("추가 신고는 잠시 후 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        moderation.reportNews(memberId, promotionId, request); return publicResponse(null, "신고를 접수했어요.");
    }

    // 전체 홍보글 목록 조회
    @GetMapping
    public ApiResponse<Page<PromotionDto.PromotionResponse>> getAllPromotions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "latest") String sortBy
    ) {
        return ApiResponse.success(promotionService.getAllPromotions(page, size, sortBy), "홍보 목록 조회 성공");
    }

    // 홍보글 상세 조회
    @GetMapping("/{promotionId}")
    public ApiResponse<PromotionDto.PromotionResponse> getPromotion(@PathVariable Long promotionId) {
        return ApiResponse.success(promotionService.getPromotion(promotionId), "홍보 상세 조회 성공");
    }

    // 내가 등록한 가게 목록 조회 (사업자용)
    @GetMapping("/my-stores")
    public ApiResponse<List<PromotionDto.StoreSimpleResponse>> getMyStores() {
        return ApiResponse.success(promotionService.getMyStores(SecurityUtil.getCurrentMemberId()), "내 가게 목록 조회 성공");
    }

    // 홍보글 작성
    @PostMapping
    public ApiResponse<PromotionDto.PromotionResponse> createPromotion(@Valid @RequestBody PromotionDto.PromotionRequest request) {
        return ApiResponse.success(promotionService.createPromotion(SecurityUtil.getCurrentMemberId(), request), "홍보글이 등록됐어요.");
    }

    // 홍보글 수정
    @PutMapping("/{promotionId}")
    public ApiResponse<PromotionDto.PromotionResponse> updatePromotion(
            @PathVariable Long promotionId,
            @Valid @RequestBody PromotionDto.PromotionRequest request
    ) {
        return ApiResponse.success(promotionService.updatePromotion(promotionId, SecurityUtil.getCurrentMemberId(), request), "홍보글이 수정됐어요.");
    }

    // 홍보글 삭제
    @DeleteMapping("/{promotionId}")
    public ApiResponse<Void> deletePromotion(@PathVariable Long promotionId) {
        promotionService.deletePromotion(promotionId, SecurityUtil.getCurrentMemberId());
        return ApiResponse.success(null, "홍보글이 삭제됐어요.");
    }

    // 내가 작성한 홍보글 목록 조회
    @GetMapping("/my")
    public ApiResponse<Page<PromotionDto.PromotionResponse>> getMyPromotions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(promotionService.getMyPromotions(SecurityUtil.getCurrentMemberId(), page, size), "내 홍보글 조회 성공");
    }

    private <T> ResponseEntity<ApiResponse<T>> publicResponse(T data, String message) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache").body(ApiResponse.success(data, message));
    }
}
