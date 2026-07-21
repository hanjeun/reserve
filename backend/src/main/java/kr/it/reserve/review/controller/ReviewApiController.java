package kr.it.reserve.review.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewResponse;
import kr.it.reserve.review.dto.ReviewUpdateRequest;
import kr.it.reserve.review.service.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/reviews")
public class ReviewApiController {

    private final ReviewService reviewService;

    /**
     * 리뷰 작성
     */
    @PostMapping
    public ResponseEntity<ApiResponse<ReviewResponse>> createReview(@Valid @RequestBody ReviewCreateRequest request) {
        ReviewResponse review = reviewService.createReview(request, SecurityUtil.getCurrentMember());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(review, "리뷰가 성공적으로 작성되었습니다."));
    }

    /**
     * 가게의 리뷰 목록 조회
     */
    @GetMapping("/store/{storeId}")
    public ApiResponse<List<ReviewResponse>> getStoreReviews(@PathVariable Long storeId) {
        return ApiResponse.success(reviewService.getStoreReviews(storeId), "가게 리뷰 목록 조회 성공");
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

    /**
     * 리뷰 삭제
     */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteReview(@PathVariable Long id) {
        reviewService.deleteReview(id, SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "리뷰가 삭제되었습니다.");
    }

    /**
     * 리뷰 수정
     */
    @PutMapping("/{id}")
    public ApiResponse<ReviewResponse> updateReview(@PathVariable Long id, @Valid @RequestBody ReviewUpdateRequest request) {
        ReviewResponse review = reviewService.updateReview(id, request, SecurityUtil.getCurrentMember());
        return ApiResponse.success(review, "리뷰가 수정되었습니다.");
    }

    /**
     * 단일 리뷰 조회
     */
    @GetMapping("/{id}")
    public ApiResponse<ReviewResponse> getReview(@PathVariable Long id) {
        return ApiResponse.success(reviewService.getReview(id), "리뷰 조회 성공");
    }

    /**
     * 예약 ID로 리뷰 조회
     */
    @GetMapping("/reservation/{reservationId}")
    public ApiResponse<ReviewResponse> getReviewByReservation(@PathVariable Long reservationId) {
        ReviewResponse review = reviewService.getReviewByReservationId(reservationId);
        return ApiResponse.success(review, "예약 기반 리뷰 조회 성공");
    }

    /**
     * 리뷰 작성 가능 여부 확인
     */
    @GetMapping("/can-write/{reservationId}")
    public ApiResponse<Map<String, Boolean>> canWriteReview(@PathVariable Long reservationId) {
        boolean canWrite = reviewService.canWriteReview(reservationId, SecurityUtil.getCurrentMember());
        return ApiResponse.success(Map.of("canWrite", canWrite), "작성 가능 여부 확인 성공");
    }
}