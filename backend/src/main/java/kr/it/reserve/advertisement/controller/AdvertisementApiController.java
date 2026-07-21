package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.dto.AdCreateRequest;
import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdUpdateRequest;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.service.AdvertisementService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/advertisements")
public class AdvertisementApiController {

    private final AdvertisementService advertisementService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * [기능] 모바일 광고 결제 사후 처리 (Redirect) — 2026-07 추가.
     * 예약 결제의 PaymentApiController#handleMobileRedirect와 동일한 패턴이지만, 광고는
     * merchantUid가 Payment 테이블이 아니라 advertisement 테이블 자체에 있어 완전히 별도
     * 엔드포인트로 둔다. 결과 페이지에 type=ad를 붙여서 PaymentResult.jsx가 예약용
     * 문구/버튼과 구별해 보여준다.
     */
    @GetMapping("/mobile-redirect")
    public String handleMobileRedirect(
            @RequestParam(value = "merchant_uid", required = false) String merchantUid,
            @RequestParam(value = "imp_success", required = false) String impSuccess,
            @RequestParam(value = "error_msg", required = false) String errorMsg) {

        boolean isSuccess = "true".equalsIgnoreCase(impSuccess);
        String redirectBase = "redirect:" + frontendUrl + "/payment/result";

        if (!isSuccess) {
            return redirectBase + "?success=false&type=ad&merchant_uid=" + merchantUid
                    + "&error_msg=" + (errorMsg != null ? errorMsg : "");
        }

        try {
            advertisementService.verifyPaymentByMerchantUid(merchantUid);
            return redirectBase + "?success=true&type=ad&merchant_uid=" + merchantUid;
        } catch (Exception e) {
            log.error("Ad mobile redirect verification failed: merchantUid={}, error={}", merchantUid, e.getMessage());
            return redirectBase + "?success=false&type=ad&merchant_uid=" + merchantUid + "&error_msg=" + e.getMessage();
        }
    }

    // 광고 신청 + 결제 준비 (사업자용)
    @PostMapping
    public ApiResponse<AdPaymentPrepareResponse> createAd(@ModelAttribute AdCreateRequest request) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        AdPaymentPrepareResponse response = advertisementService.createAd(request, member);
        return ApiResponse.success(response, "광고 결제 준비 완료");
    }

    // 결제 재시도 준비 (사업자용) — 결제 대기/실패 상태에서 다시 결제창을 여는 버튼용
    @PostMapping("/{id}/prepare-payment")
    public ApiResponse<AdPaymentPrepareResponse> preparePayment(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        AdPaymentPrepareResponse response = advertisementService.preparePayment(id, member);
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

    // 광고 성과 지표(2026-07 추가) — 셋 다 공개 API(로그인 불필요). 장식적 요소라 실패해도 500을 터뜨리지 않고
    // 항상 200을 돌려줌(프론트에서도 실패를 사용자에게 노출하지 않음).
    @PatchMapping("/{id}/impression")
    public ApiResponse<Void> recordImpression(@PathVariable Long id) {
        advertisementService.recordImpression(id);
        return ApiResponse.success(null, "기록됨");
    }

    // 배너 클릭 기록(2026-07 추가) — 공개 API
    @PatchMapping("/{id}/click")
    public ApiResponse<Void> recordClick(@PathVariable Long id) {
        advertisementService.recordClick(id);
        return ApiResponse.success(null, "기록됨");
    }

    // 전환 기록(2026-07 추가) — 공개 API, 예약 생성 직후 프론트가 호출(귀속 판단은 sessionStorage 기반)
    @PatchMapping("/{id}/conversion")
    public ApiResponse<Void> recordConversion(@PathVariable Long id) {
        advertisementService.recordConversion(id);
        return ApiResponse.success(null, "기록됨");
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

    // 배너 광고 콘텐츠(제목/설명/이미지) 수정 (사업자용, 본인 가게만)
    @PatchMapping("/{id}")
    public ApiResponse<AdvertisementResponse> updateAd(@PathVariable Long id, @ModelAttribute AdUpdateRequest request) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        AdvertisementResponse response = advertisementService.updateAd(id, request, member);
        return ApiResponse.success(response, "광고가 수정되었습니다.");
    }

    // 광고 취소 (사업자용, 본인 가게만) — 결제 전이면 그냥 취소, 결제 후면 전액 환불
    @DeleteMapping("/{id}")
    public ApiResponse<Void> cancelAd(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        advertisementService.cancelAd(id, member);
        return ApiResponse.success(null, "광고가 취소되었습니다.");
    }

    // 종료상태(만료/취소/환불/중단) 광고를 목록에서 숨기기(소프트삭제) — 2026-07 추가, 사업자용
    @DeleteMapping("/{id}/remove")
    public ApiResponse<Void> removeAd(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        advertisementService.removeAd(id, member);
        return ApiResponse.success(null, "목록에서 삭제되었습니다.");
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없습니다.");
        }
    }

    private void validateAdminAuth(Member member) {
        if (!member.isAdmin()) {
            throw ReservationException.forbidden("관리자 권한이 없습니다.");
        }
    }
}
