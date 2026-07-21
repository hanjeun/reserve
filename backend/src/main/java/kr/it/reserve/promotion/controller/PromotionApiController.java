package kr.it.reserve.promotion.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.service.PromotionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
@RequiredArgsConstructor
public class PromotionApiController {

    private final PromotionService promotionService;

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
    public ApiResponse<PromotionDto.PromotionResponse> createPromotion(@RequestBody PromotionDto.PromotionRequest request) {
        return ApiResponse.success(promotionService.createPromotion(SecurityUtil.getCurrentMemberId(), request), "홍보글이 등록되었습니다.");
    }

    // 홍보글 수정
    @PutMapping("/{promotionId}")
    public ApiResponse<PromotionDto.PromotionResponse> updatePromotion(
            @PathVariable Long promotionId,
            @RequestBody PromotionDto.PromotionRequest request
    ) {
        return ApiResponse.success(promotionService.updatePromotion(promotionId, SecurityUtil.getCurrentMemberId(), request), "홍보글이 수정되었습니다.");
    }

    // 홍보글 삭제
    @DeleteMapping("/{promotionId}")
    public ApiResponse<Void> deletePromotion(@PathVariable Long promotionId) {
        promotionService.deletePromotion(promotionId, SecurityUtil.getCurrentMemberId());
        return ApiResponse.success(null, "홍보글이 삭제되었습니다.");
    }

    // 내가 작성한 홍보글 목록 조회
    @GetMapping("/my")
    public ApiResponse<Page<PromotionDto.PromotionResponse>> getMyPromotions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(promotionService.getMyPromotions(SecurityUtil.getCurrentMemberId(), page, size), "내 홍보글 조회 성공");
    }
}