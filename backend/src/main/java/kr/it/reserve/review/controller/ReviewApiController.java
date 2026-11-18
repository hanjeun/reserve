package kr.it.reserve.review.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.dto.ReviewUpdateRequest;
import kr.it.reserve.review.service.ReviewService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.context.request.WebRequest;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/reviews")
public class ReviewApiController {

    private final ReviewService reviewService;
    private final RateLimiter limiter;

    @PutMapping("/{id}/owner-reply")
    public ApiResponse<ReviewResponse> ownerReply(@PathVariable Long id, @Valid @RequestBody OwnerReply request, HttpServletRequest http) {
        return ApiResponse.success(reviewService.replyAsOwner(id, writer(http), request.content()), "답변을 저장했어요.");
    }

    public record OwnerReply(@NotBlank @Size(max = 500) String content) { }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<ReviewResponse>> createReview(@Valid @RequestBody ReviewCreateRequest request, HttpServletRequest http) {
        ReviewResponse review = reviewService.createReview(request, writer(http));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(review, "리뷰가 성공적으로 작성됐어요."));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ReviewResponse>> createWithPhotos(@Valid @RequestPart("review") ReviewCreateRequest request,
            @RequestPart(value = "photos", required = false) List<MultipartFile> photos, HttpServletRequest http) {
        ReviewResponse review = reviewService.createReview(request, writer(http), orEmpty(photos));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(review, "리뷰가 성공적으로 작성됐어요."));
    }

    /**
     * 가게의 리뷰 목록 조회
     */
    @GetMapping(value = "/store/{storeId}", params = "!limit")
    public ResponseEntity<ApiResponse<List<ReviewResponse>>> getStoreReviews(@PathVariable Long storeId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(reviewService.getStoreReviews(storeId, viewer()), "가게 리뷰 목록 조회 성공"));
    }

    @GetMapping(value = "/store/{storeId}", params = "limit")
    public ResponseEntity<ApiResponse<ReviewService.StoreReviewPage>> getStoreReviewPage(@PathVariable Long storeId,
            @RequestParam int limit, @RequestParam(required = false) Long beforeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime beforeDate,
            @RequestParam(required = false) Long focusId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(reviewService.getStoreReviewPage(storeId, limit, beforeId, beforeDate, focusId, viewer()),
                        "가게 리뷰 목록 조회 성공"));
    }

    /**
     * 가게의 리뷰 통계 조회
     */
    @GetMapping("/store/{storeId}/stats")
    public ApiResponse<Map<String, Object>> getStoreReviewStats(@PathVariable Long storeId) {
        Map<String, Object> stats = new HashMap<>();
        stats.put("averageRating", reviewService.getAverageRating(storeId));
        stats.put("reviewCount", reviewService.getReviewCount(storeId));

        return ApiResponse.success(stats, "리뷰 통계 조회 성공");
    }

    /**
     * 내 리뷰 목록 조회
     */
    @GetMapping("/my")
    public ApiResponse<List<ReviewResponse>> getMyReviews() {
        return ApiResponse.success(reviewService.getMyReviews(SecurityUtil.getCurrentMember()), "내 리뷰 목록 조회 성공");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteReview(@PathVariable Long id, HttpServletRequest http) {
        reviewService.deleteReview(id, writer(http));
        return ApiResponse.success(null, "리뷰가 삭제됐어요.");
    }

    @PutMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<ReviewResponse> updateReview(@PathVariable Long id, @Valid @RequestBody ReviewUpdateRequest request, HttpServletRequest http) {
        ReviewResponse review = reviewService.updateReview(id, request, writer(http));
        return ApiResponse.success(review, "리뷰가 수정됐어요.");
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ReviewResponse> updateWithPhotos(@PathVariable Long id, @Valid @RequestPart("review") ReviewUpdateRequest request,
            @RequestPart(value = "photos", required = false) List<MultipartFile> photos,
            @RequestPart(value = "removedPhotoIds", required = false) List<Long> removedPhotoIds, HttpServletRequest http) {
        return ApiResponse.success(reviewService.updateReview(id, request, writer(http),
                orEmpty(removedPhotoIds), orEmpty(photos)), "리뷰가 수정됐어요.");
    }

    @GetMapping("/{id}/photos/{photoId}")
    public ResponseEntity<byte[]> getPhoto(@PathVariable Long id, @PathVariable Long photoId,
            @RequestParam(defaultValue = "original") String size, WebRequest request) {
        if (!"original".equals(size) && !"thumbnail".equals(size)) {
            throw new ReviewException("사진 크기를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        var result = reviewService.getPhoto(id, photoId, "thumbnail".equals(size), request::checkNotModified);
        var cache = CacheControl.noCache().cachePrivate();
        var image = result.image();
        if (image == null) return ResponseEntity.status(HttpStatus.NOT_MODIFIED).cacheControl(cache).eTag(result.etag()).build();
        return ResponseEntity.ok().cacheControl(cache).eTag(result.etag()).contentType(MediaType.parseMediaType(image.contentType()))
                .contentLength(image.bytes().length).body(image.bytes());
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    /**
     * 단일 리뷰 조회
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ReviewResponse>> getReview(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(reviewService.getReview(id, viewer()), "리뷰 조회 성공"));
    }

    /**
     * 예약 ID로 리뷰 조회
     */
    @GetMapping("/reservation/{reservationId}")
    public ApiResponse<ReviewResponse> getReviewByReservation(@PathVariable Long reservationId) {
        ReviewResponse review = reviewService.getReviewByReservationId(reservationId, SecurityUtil.getCurrentMember());
        return ApiResponse.success(review, "예약 기반 리뷰 조회 성공");
    }

    @GetMapping("/can-write/{reservationId}")
    public ApiResponse<Map<String, Boolean>> canWriteReview(@PathVariable Long reservationId) {
        boolean canWrite = reviewService.canWriteReview(reservationId, SecurityUtil.getCurrentMember());
        return ApiResponse.success(Map.of("canWrite", canWrite), "작성 가능 여부 확인 성공");
    }

    private static Member viewer() {
        return SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMember() : null;
    }

    private Member writer(HttpServletRequest request) {
        Member member = SecurityUtil.getCurrentMember();
        if (!limiter.tryConsume("review-write-ip:" + IpExtractor.extract(request), RateLimiter.Policy.CHAT_SEND)
                || !limiter.tryConsume("review-write-member:" + member.getId(), RateLimiter.Policy.CHAT_MEMBER_SEND)) {
            throw new ReviewException("리뷰 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return member;
    }
}
