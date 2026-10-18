package kr.it.reserve.feed.news.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.news.service.StoreNewsEvents;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.List;

@RestController @RequestMapping("/api/store-news") @RequiredArgsConstructor
public class StoreNewsController {
    private final StoreNewsService news;
    private final FeedMediaService media;
    private final RateLimiter limiter;
    private final StoreNewsEvents events;
    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(HttpServletRequest http, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Accel-Buffering", "no");
        Long id = member();
        if (!limiter.tryConsume("news-events-member:" + id, RateLimiter.Policy.AD_METRIC)) {
            throw new FeedException("잠시 후 다시 연결해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return events.subscribe(SecurityUtil.getCurrentMember("로그인이 필요해요."));
    }
    @GetMapping("/config")
    public ResponseEntity<ApiResponse<StoreNewsDto.Configuration>> config() {
        var config = media.newsConfig();
        return response(new StoreNewsDto.Configuration(config.enabled(), config.imageEnabled(), config.maxImages(),
                config.maxImageBytes(), config.deleteGraceDays(), config.enabled(), true, true), "가게 소식 설정 조회 성공");
    }
    @GetMapping("/stores")
    public ResponseEntity<ApiResponse<List<StoreNewsDto.StoreChoice>>> stores() { return response(news.stores(member()), "내 가게 조회 성공"); }
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Page<StoreNewsDto.News>>> mine(@RequestParam(defaultValue = "ALL") String state,
            @RequestParam(required = false) Long storeId, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return response(news.mine(member(), storeId, state, page, size), "내 가게 소식 조회 성공");
    }
    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<StoreNewsDto.News>> own(@PathVariable Long id) { return response(news.own(member(), id), "가게 소식 조회 성공"); }
    @PostMapping
    public ResponseEntity<ApiResponse<StoreNewsDto.News>> create(@Valid @RequestBody StoreNewsDto.Request request, HttpServletRequest http) {
        Long member = member(); limit(member, http); return response(news.create(member, request), request.draft() ? "소식을 임시저장했어요." : "가게 소식을 게시했어요.");
    }
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<StoreNewsDto.News>> edit(@PathVariable Long id, @Valid @RequestBody StoreNewsDto.Request request, HttpServletRequest http) {
        Long member = member(); limit(member, http); return response(news.edit(member, id, request), "가게 소식을 저장했어요.");
    }
    @DeleteMapping("/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id, HttpServletRequest http) {
        Long member = member(); limit(member, http); news.delete(member, id); return response(null, "가게 소식을 삭제했어요.");
    }
    private Long member() { return SecurityUtil.getCurrentMember("로그인이 필요해요.").getId(); }
    @PostMapping(value = "/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FeedDto.Image>> upload(@RequestPart("file") MultipartFile file, HttpServletRequest http) {
        Long member = member(); limit(member, http); return response(media.uploadNews(member, file), "혜택 사진을 첨부했어요.");
    }
    @GetMapping("/media/{id:[0-9]+}")
    public ResponseEntity<byte[]> image(@PathVariable Long id, HttpServletRequest http) {
        if (!limiter.tryConsume("feed-image-read:" + IpExtractor.extract(http), RateLimiter.Policy.AD_METRIC)) {
            throw new FeedException("잠시 후 사진을 다시 불러와주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        Long viewer = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        var image = media.readNews(id, viewer);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")
                .header("X-Content-Type-Options", "nosniff").header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=benefit-photo." + ("image/png".equals(image.contentType()) ? "png" : "jpg"))
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
    private void limit(Long member, HttpServletRequest http) {
        // 같은 사진 업로드/피드 작성 한도를 공유하여 경로를 바꿔 우회하지 못한다.
        if (!limiter.tryConsume("feed-write-ip:" + IpExtractor.extract(http), RateLimiter.Policy.CHAT_SEND)
                || !limiter.tryConsume("feed-write-member:" + member, RateLimiter.Policy.CHAT_SEND)) {
            throw new FeedException("조금 천천히 작성해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    private <T> ResponseEntity<ApiResponse<T>> response(T data, String message) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache").body(ApiResponse.success(data, message));
    }
}
