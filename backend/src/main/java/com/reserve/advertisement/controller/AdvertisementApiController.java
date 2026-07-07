package com.reserve.advertisement.controller;

import com.reserve.advertisement.dto.AdCreateRequest;
import com.reserve.advertisement.dto.AdPaymentPrepareResponse;
import com.reserve.advertisement.dto.AdvertisementResponse;
import com.reserve.advertisement.entity.AdType;
import com.reserve.advertisement.service.AdvertisementService;
import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.ReservationException;
import com.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/advertisements")
public class AdvertisementApiController {

    private final AdvertisementService advertisementService;

    // 광고 신청 + 결제 준비 (사업자용)
    @PostMapping
    public ApiResponse<AdPaymentPrepareResponse> createAd(@ModelAttribute AdCreateRequest request) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        AdPaymentPrepareResponse response = advertisementService.createAd(request, member);
        return ApiResponse.success(response, "광고 결제 준비 완료");
    }

    // 결제 검증 + 활성화 (사업자용)
    @PostMapping("/verify-payment")
    public ApiResponse<AdvertisementResponse> verifyPayment(@RequestBody Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        String merchantUid = body.get("merchantUid");
        AdvertisementResponse response = advertisementService.verifyPayment(merchantUid, member);
        return ApiResponse.success(response, "광고가 활성화되었습니다.");
    }

    // 노출용 — 공개 API (StoreList 배지/배너 위젯)
    @GetMapping("/active")
    public ApiResponse<List<AdvertisementResponse>> getActiveAds(@RequestParam String type) {
        AdType adType = AdType.valueOf(type);
        return ApiResponse.success(advertisementService.getActiveAds(adType), "조회 성공");
    }

    // 내 광고 신청 내역 (사업자용)
    @GetMapping("/my")
    public ApiResponse<List<AdvertisementResponse>> getMyAds() {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        return ApiResponse.success(advertisementService.getMyAds(member), "조회 성공");
    }

    // 전체 광고 목록 (관리자용)
    @GetMapping("/admin/all")
    public ApiResponse<Page<AdvertisementResponse>> getAllAds(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateAdminAuth(member);
        return ApiResponse.success(advertisementService.getAllAds(page, size), "조회 성공");
    }

    // 광고 강제 중단 (관리자용) — 사전 승인 대신 사후 제재
    @PatchMapping("/admin/{id}/suspend")
    public ApiResponse<Void> suspendAd(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateAdminAuth(member);
        String reason = body != null ? body.get("reason") : null;
        advertisementService.suspendAd(id, reason);
        return ApiResponse.success(null, "광고가 중단되었습니다.");
    }

    // 광고 취소 (사업자용, 본인 가게만) — 결제 전이면 그냥 취소, 결제 후면 전액 환불
    @DeleteMapping("/{id}")
    public ApiResponse<Void> cancelAd(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        advertisementService.cancelAd(id, member);
        return ApiResponse.success(null, "광고가 취소되었습니다.");
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없습니다.");
        }
    }

    private void validateAdminAuth(Member member) {
        if (!member.isAdmin()) {
            throw new ReservationException("관리자 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
    }
}
