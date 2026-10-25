package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.dto.AdCreateRequest;
import kr.it.reserve.advertisement.dto.AdConversionRequest;
import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdUpdateRequest;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.service.AdvertisementService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Import;
import kr.it.reserve.config.SiteUrls;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/advertisements")
@Import(SiteUrls.class)
public class AdvertisementApiController {

    private static final String LOGIN_REQUIRED = "로그인이 필요해요.";
    private static final String QUERY_SUCCESS = "조회 성공";
    private static final String FAILED_REDIRECT_QUERY = "?success=false&type=ad&merchant_uid=";
    private static final String ERROR_MESSAGE_QUERY = "&error_msg=";

    private final AdvertisementService advertisementService;
    private final RateLimiter rateLimiter;

    @Value("#{siteUrls.frontendOrigin}")
    private String frontendUrl;

    /**
     * 광고의 PortOne V2 모바일 콜백을 검증하고 type=ad 결과 페이지로 302 이동한다.
     * code가 없다는 이유만으로 성공 처리하지 않으며 광고 결제의 서버 검증 관문을 거친다.
     * RestController이므로 ResponseEntity의 Location으로 리다이렉트한다.
     */
    @GetMapping("/mobile-redirect")
    public ResponseEntity<Void> handleMobileRedirect(
            @RequestParam(value = "paymentId", required = false) String paymentId,
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "message", required = false) String message) {

        boolean isSuccess = (code == null || code.isBlank());
        String redirectBase = frontendUrl + "/payment/result";
        // 프론트 결과 페이지는 merchant_uid 로 읽는다. 이름은 그대로 두고 값만 V2 의 paymentId 를 싣는다.
        String merchantUid = paymentId;

        log.info("Ad mobile redirect received: hasPaymentId={}, hasErrorCode={}",
                paymentId != null && !paymentId.isBlank(), code != null && !code.isBlank());

        if (!isSuccess) {
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("광고 결제 완료를 확인하지 못했어요. 내역을 확인해주세요."));
        }

        try {
            advertisementService.verifyPaymentByMerchantUid(merchantUid);
            return redirect(redirectBase + "?success=true&type=ad&merchant_uid=" + enc(merchantUid));
        } catch (BusinessException e) {
            // 외부 API 래퍼의 도메인 예외에도 원문이 섞일 수 있으므로 URL에 전달하지 않는다.
            log.warn("Ad mobile redirect verification failed: errorType={}", e.getClass().getSimpleName());
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("광고 결제 완료를 확인하지 못했어요. 내역을 확인해주세요."));
        } catch (Exception e) {
            // 예상치 못한 예외의 메시지에는 내부 구조(클래스명·SQL·외부 API 응답)가 섞일 수 있다.
            // URL과 일반 로그에는 원문 대신 고정 문구·오류 종류만 남긴다.
            log.error("Ad mobile redirect error: errorType={}", e.getClass().getSimpleName());
            return redirect(redirectBase + FAILED_REDIRECT_QUERY + enc(merchantUid)
                    + ERROR_MESSAGE_QUERY + enc("광고 결제 처리 중 오류가 발생했어요."));
        }
    }

    /**
     * 302 응답을 만든다. 목적지는 항상 우리 프론트엔드 URL 이고 쿼리 값은 {@link #enc} 로 인코딩된 뒤
     * 넘어오므로, 외부 입력이 Location 헤더의 호스트를 바꾸는 경로는 없다(오픈 리다이렉트 아님).
     */
    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .build();
    }

    /**
     * 리다이렉트 쿼리스트링에 실을 값을 URL 인코딩한다.
     * 여기서 만든 문자열은 그대로 Location 헤더가 되므로,
     * 값에 &·#·%가 섞이면 파라미터가 잘리거나 뒤에 임의 파라미터를 덧붙일 수 있다.
     */
    private static String enc(String value) {
        return value == null ? "" : URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    // 광고 신청 + 결제 준비 (사업자용)
    @PostMapping
    public ApiResponse<AdPaymentPrepareResponse> createAd(@ModelAttribute AdCreateRequest request) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        AdPaymentPrepareResponse response = advertisementService.createAd(request, member);
        return ApiResponse.success(response, "광고 결제 준비 완료");
    }

    // 결제 재시도 준비 (사업자용) — 결제 대기/실패 상태에서 다시 결제창을 여는 버튼용
    @PostMapping("/{id}/prepare-payment")
    public ApiResponse<AdPaymentPrepareResponse> preparePayment(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        AdPaymentPrepareResponse response = advertisementService.preparePayment(id, member);
        return ApiResponse.success(response, "광고 결제 준비 완료");
    }

    // 결제 검증 + 활성화 (사업자용)
    @PostMapping("/verify-payment")
    public ApiResponse<AdvertisementResponse> verifyPayment(@RequestBody Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        String merchantUid = body.get("merchantUid");
        AdvertisementResponse response = advertisementService.verifyPayment(merchantUid, member);
        return ApiResponse.success(response, "광고가 활성화됐어요.");
    }

    // 노출용 — 공개 API (StoreList 배지/배너 위젯)
    @GetMapping("/active")
    public ApiResponse<List<AdvertisementResponse>> getActiveAds(@RequestParam AdType type) {
        return ApiResponse.success(advertisementService.getActiveAds(type), QUERY_SUCCESS);
    }

    // 광고 성과 지표 — 노출·클릭만 공개 API(로그인 불필요)다. 두 지표는 장식적 요소라
    // 실패해도 500을 터뜨리지 않고 항상 200을 돌려준다. 전환은 아래에서 로그인 회원의 예약을 검증한다.
    @PatchMapping("/{id}/impression")
    public ApiResponse<Void> recordImpression(@PathVariable Long id, HttpServletRequest request) {
        recordMetricQuietly(id, request, () -> advertisementService.recordImpression(id));
        return ApiResponse.success(null, "기록됨");
    }

    // 배너 클릭 기록 — 공개 API
    @PatchMapping("/{id}/click")
    public ApiResponse<Void> recordClick(@PathVariable Long id, HttpServletRequest request) {
        recordMetricQuietly(id, request, () -> advertisementService.recordClick(id));
        return ApiResponse.success(null, "기록됨");
    }

    // 전환 기록 — 예약 생성 직후 로그인 회원이 호출한다. 서비스가 예약·광고·가게 귀속을 다시 검증한다.
    @PatchMapping("/{id}/conversion")
    public ApiResponse<Void> recordConversion(
            @PathVariable Long id,
            @Valid @RequestBody AdConversionRequest request) {
        advertisementService.recordConversion(
                id,
                request.reservationId(),
                SecurityUtil.getCurrentMember(LOGIN_REQUIRED));
        return ApiResponse.success(null, "기록됨");
    }

    /**
     * 공개 지표 기록의 IP 한도를 확인한다. 초과 시 사용자 요청을 실패시키지 않고 기록만 생략한다.
     * 광고 지표는 보조 통계이며 이 제한만으로 청구용 집계의 정확성을 보증하지 않는다.
     */
    private boolean allowMetric(HttpServletRequest request) {
        return rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.AD_METRIC);
    }

    /**
     * 공개 지표는 광고 화면의 보조 신호라 유효하지 않은 ID·한도 초과·일시적인 저장소 장애를
     * 사용자 요청 실패로 바꾸지 않는다. 실제 집계 가능 여부는 서비스가 광고 상태까지 확인한다.
     */
    private void recordMetricQuietly(Long adId, HttpServletRequest request, Runnable recorder) {
        try {
            if (allowMetric(request)) {
                recorder.run();
            }
        } catch (RuntimeException e) {
            log.debug("Advertisement metric ignored: adId={}, errorType={}",
                    adId, e.getClass().getSimpleName());
        }
    }

    // 내 광고 신청 내역 (사업자용)
    @GetMapping("/my")
    public ApiResponse<Page<AdvertisementResponse>> getMyAds(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long storeId,
            @RequestParam(required = false) String search) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        return ApiResponse.success(
                advertisementService.getMyAds(member, page, size, storeId, search), QUERY_SUCCESS);
    }

    // 가게 이름으로 검색한 관리자 광고 목록.
    @GetMapping("/admin/all")
    public ApiResponse<Page<AdvertisementResponse>> getAllAds(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateAdminAuth(member);
        return ApiResponse.success(advertisementService.getAllAds(page, size, search), QUERY_SUCCESS);
    }

    // 광고 강제 중단 (관리자용) — 사전 승인 대신 사후 제재
    @PatchMapping("/admin/{id}/suspend")
    public ApiResponse<Void> suspendAd(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateAdminAuth(member);
        String reason = body != null ? body.get("reason") : null;
        advertisementService.suspendAd(id, reason);
        return ApiResponse.success(null, "광고가 중단됐어요.");
    }

    // 배너 광고 콘텐츠(제목/설명/이미지) 수정 (사업자용, 본인 가게만)
    @PatchMapping("/{id}")
    public ApiResponse<AdvertisementResponse> updateAd(@PathVariable Long id, @ModelAttribute AdUpdateRequest request) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        AdvertisementResponse response = advertisementService.updateAd(id, request, member);
        return ApiResponse.success(response, "광고가 수정됐어요.");
    }

    // 광고 취소 (사업자용, 본인 가게만) — 결제 전이면 그냥 취소, 결제 후면 전액 환불
    @DeleteMapping("/{id}")
    public ApiResponse<Void> cancelAd(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        advertisementService.cancelAd(id, member);
        return ApiResponse.success(null, "광고 취소 요청을 접수했어요. 환불 여부는 광고 내역에서 확인해주세요.");
    }

    // 종료된 본인 광고를 목록에서만 숨긴다.
    @DeleteMapping("/{id}/remove")
    public ApiResponse<Void> removeAd(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember(LOGIN_REQUIRED);
        validateBusinessAuth(member);
        advertisementService.removeAd(id, member);
        return ApiResponse.success(null, "목록에서 삭제됐어요.");
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없어요.");
        }
    }

    private void validateAdminAuth(Member member) {
        if (!member.isAdmin()) {
            throw ReservationException.forbidden("관리자 권한이 없어요.");
        }
    }
}
