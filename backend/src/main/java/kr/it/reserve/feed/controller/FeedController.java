package kr.it.reserve.feed.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.service.*;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController @RequestMapping("/api/feed") @RequiredArgsConstructor
public class FeedController {
    private final FeedService feeds;
    private final FeedMediaService images;
    private final FeedModerationService moderation;
    private final RateLimiter limiter;

    @GetMapping("/config")
    public ResponseEntity<ApiResponse<FeedDto.Configuration>> config() { return response(images.config(), "피드 설정 조회 성공"); }

    @GetMapping("/regions")
    public ResponseEntity<ApiResponse<java.util.List<FeedDto.RegionGroup>>> regions() {
        return response(feeds.publicRegions(), "피드 지역 조회 성공");
    }

    @GetMapping("/posts")
    public ResponseEntity<ApiResponse<Page<FeedDto.Post>>> posts(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size, @RequestParam(required = false) String region,
            @RequestParam(defaultValue = "false") boolean favoriteOnly) {
        return response(feeds.publicPosts(page, size, region, favoriteOnly, viewer()), "피드 조회 성공");
    }
    @GetMapping("/posts/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedDto.Post>> post(@PathVariable Long id) { return response(feeds.readPost(id, viewer()), "게시물 조회 성공"); }

    @GetMapping("/authors/{publicId}")
    public ResponseEntity<ApiResponse<FeedDto.Profile>> author(@PathVariable String publicId) { return response(feeds.publicProfile(publicId), "공개 프로필 조회 성공"); }
    @GetMapping("/authors/{publicId}/posts")
    public ResponseEntity<ApiResponse<Page<FeedDto.Post>>> authorPosts(@PathVariable String publicId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return response(feeds.authorPosts(publicId, page, size, viewer()), "작성자 피드 조회 성공");
    }

    @GetMapping("/me/profile")
    public ResponseEntity<ApiResponse<FeedDto.Profile>> myProfile() { return response(feeds.myProfile(member()), "내 공개 프로필 조회 성공"); }
    @PutMapping("/me/profile")
    public ResponseEntity<ApiResponse<FeedDto.Profile>> profile(@Valid @RequestBody FeedDto.ProfileRequest request, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http); return response(feeds.updateProfile(member, request), "공개 프로필을 저장했어요.");
    }
    @PutMapping(value = "/me/profile/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FeedDto.Profile>> profileAvatar(@RequestPart("image") MultipartFile image, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http);
        return response(feeds.uploadProfileAvatar(member, image), "공개 프로필 사진을 저장했어요.");
    }
    @DeleteMapping("/me/profile/avatar")
    public ResponseEntity<ApiResponse<FeedDto.Profile>> deleteProfileAvatar(HttpServletRequest http) {
        Long member = member(); limitWrite(member, http);
        return response(feeds.deleteProfileAvatar(member), "공개 프로필 사진을 지웠어요.");
    }
    @GetMapping("/me/posts")
    public ResponseEntity<ApiResponse<Page<FeedDto.Post>>> myPosts(@RequestParam(defaultValue = "false") boolean drafts,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return response(feeds.myPosts(member(), drafts, page, size), "내 게시물 조회 성공");
    }

    @PostMapping("/posts")
    public ResponseEntity<ApiResponse<FeedDto.Post>> create(@Valid @RequestBody FeedDto.PostRequest request, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http); return response(feeds.create(member, request), request.draft() ? "초안을 저장했어요." : "게시물을 올렸어요.");
    }
    @PutMapping("/posts/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<FeedDto.Post>> edit(@PathVariable Long id, @Valid @RequestBody FeedDto.PostRequest request, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http); return response(feeds.edit(member, id, request), "게시물을 저장했어요.");
    }
    @DeleteMapping("/posts/{id:[0-9]+}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http); feeds.delete(member, id); return response(null, "게시물을 삭제했어요.");
    }
    @PostMapping(value = "/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FeedDto.Image>> upload(@RequestPart("file") MultipartFile file, HttpServletRequest http) {
        Long member = member(); limitWrite(member, http); return response(images.upload(member, file), "사진을 첨부했어요.");
    }
    @GetMapping("/media/{id:[0-9]+}")
    public ResponseEntity<byte[]> image(@PathVariable Long id, HttpServletRequest http) {
        if (!limiter.tryConsume("feed-image-read:" + IpExtractor.extract(http), RateLimiter.Policy.AD_METRIC)) {
            throw new FeedException("잠시 후 사진을 다시 불러와주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return imageResponse(images.read(id, viewer()));
    }
    @PostMapping("/posts/{id:[0-9]+}/reports")
    public ResponseEntity<ApiResponse<Void>> report(@PathVariable Long id, @Valid @RequestBody FeedDto.ReportRequest request) {
        Long member = member();
        if (!limiter.tryConsume("feed-report-member:" + member, RateLimiter.Policy.CHAT_REPORT)) {
            throw new FeedException("추가 신고는 잠시 후 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        moderation.report(member, id, request); return response(null, "신고를 접수했어요.");
    }

    private void limitWrite(Long member, HttpServletRequest request) {
        if (!limiter.tryConsume("feed-write-ip:" + IpExtractor.extract(request), RateLimiter.Policy.CHAT_SEND)
                || !limiter.tryConsume("feed-write-member:" + member, RateLimiter.Policy.CHAT_SEND)) {
            throw new FeedException("조금 천천히 작성해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    private Long member() { return SecurityUtil.getCurrentMember("로그인이 필요해요.").getId(); }
    private Long viewer() { return SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null; }
    static <T> ResponseEntity<ApiResponse<T>> response(T data, String message) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")
                .body(ApiResponse.success(data, message));
    }
    static ResponseEntity<byte[]> imageResponse(FeedMediaService.ImageContent image) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")
                .header("X-Content-Type-Options", "nosniff").header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=feed-photo." + ("image/png".equals(image.contentType()) ? "png" : "jpg"))
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
}
