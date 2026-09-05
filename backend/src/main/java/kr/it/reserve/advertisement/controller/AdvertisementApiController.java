package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.dto.AdCreateRequest;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
public class AdvertisementApiController {

    private final AdvertisementService advertisementService;
    private final RateLimiter rateLimiter;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * [기능] 모바일 광고 결제 사후 처리 (Redirect) — 2026-07 추가.
     * 예약 결제의 PaymentApiController#handleMobileRedirect와 동일한 패턴이지만, 광고는
     * merchantUid가 Payment 테이블이 아니라 advertisement 테이블 자체에 있어 완전히 별도
     * 엔드포인트로 둔다. 결과 페이지에 type=ad를 붙여서 PaymentResult.jsx가 예약용
     * 문구/버튼과 구별해 보여준다.
     *
     * <p>★ 2026-08-10 두 가지를 함께 고쳤다.
     * <ol>
     *   <li><b>302 가 나가지 않던 버그.</b> 이 클래스는 {@code @RestController} 라 뷰 리졸버를 타지 않는데
     *       {@code "redirect:" + url} 문자열을 반환하고 있었다. 그 문자열이 <b>응답 본문</b>으로 찍혀서
     *       모바일 광고 결제 후 브라우저에 {@code redirect:https://...} 가 그대로 보이고 이동하지 않았다.
     *       예약 결제 쪽은 PR #122 에서 고쳤는데 같은 패턴을 복사해 둔 이 파일이 빠져 있었다.</li>
     *   <li><b>PortOne V2 파라미터.</b> {@code merchant_uid/imp_success/error_msg} →
     *       {@code paymentId/code/message}. V2 는 성공 시 {@code code} 를 보내지 않으므로
     *       <b>code 가 없으면 성공</b>이다.</li>
     * </ol>
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

        log.info("Ad mobile redirect received: paymentId={}, code={}", paymentId, code);

        if (!isSuccess) {
            return redirect(redirectBase + "?success=false&type=ad&merchant_uid=" + enc(merchantUid)
                    + "&error_msg=" + enc(message));
        }

        try {
            advertisementService.verifyPaymentByMerchantUid(merchantUid);
            return redirect(redirectBase + "?success=true&type=ad&merchant_uid=" + enc(merchantUid));
        } catch (BusinessException e) {
            // 도메인 예외의 메시지는 애초에 사용자에게 보여줄 목적으로 쓴 한국어 문구라 그대로 전달한다.
            log.warn("Ad mobile redirect verification failed: merchantUid={}, errorType={}",
                    merchantUid, e.getClass().getSimpleName());
            return redirect(redirectBase + "?success=false&type=ad&merchant_uid=" + enc(merchantUid)
                    + "&error_msg=" + enc(e.getMessage()));
        } catch (Exception e) {
            // 예상치 못한 예외의 메시지에는 내부 구조(클래스명·SQL·외부 API 응답)가 섞일 수 있다.
            // 브라우저 주소창에 그대로 실려 나가므로 고정 문구로 대체하고, 원인은 로그·Sentry에만 남긴다.
            log.error("Ad mobile redirect error: merchantUid={}", merchantUid, e);
            return redirect(redirectBase + "?success=false&type=ad&merchant_uid=" + enc(merchantUid)
                    + "&error_msg=" + enc("광고 결제 처리 중 오류가 발생했습니다."));
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
    public ApiResponse<Void> recordImpression(@PathVariable Long id, HttpServletRequest request) {
        if (allowMetric(request)) {
            advertisementService.recordImpression(id);
        }
        return ApiResponse.success(null, "기록됨");
    }

    // 배너 클릭 기록(2026-07 추가) — 공개 API
    @PatchMapping("/{id}/click")
    public ApiResponse<Void> recordClick(@PathVariable Long id, HttpServletRequest request) {
        if (allowMetric(request)) {
            advertisementService.recordClick(id);
        }
        return ApiResponse.success(null, "기록됨");
    }

    // 전환 기록(2026-07 추가) — 공개 API, 예약 생성 직후 프론트가 호출(귀속 판단은 sessionStorage 기반)
    @PatchMapping("/{id}/conversion")
    public ApiResponse<Void> recordConversion(@PathVariable Long id, HttpServletRequest request) {
        if (allowMetric(request)) {
            advertisementService.recordConversion(id);
        }
        return ApiResponse.success(null, "기록됨");
    }

    /**
     * 광고 지표(노출·클릭·전환) 기록을 받아줄지 판단한다 — 2026-08 추가.
     *
     * <p><b>왜 필요했나.</b> 위 세 엔드포인트는 로그인이 필요 없고 카운터를 그냥 올려준다.
     * 백엔드 상한이 없어서 {@code curl} 반복만으로 노출수·클릭수를 임의로 부풀릴 수 있었다.
     * 광고는 <b>돈을 받고 파는 상품</b>이라 지표가 왜곡되면 청구와 성과 보고의 신뢰가 통째로 흔들린다.
     *
     * <p><b>왜 429 를 던지지 않는가.</b> 이 세 엔드포인트의 계약은 "무슨 일이 있어도 200"이다
     * (프론트가 실패를 사용자에게 노출하지 않는다). 한도를 넘기면 <b>조용히 기록만 건너뛰고</b>
     * 응답은 그대로 성공으로 돌려준다. 덤으로, 429 를 돌려주면 자동화 스크립트에 "여기가 한도다"라고
     * 알려주는 셈이라 한도 바로 아래로 맞춰 계속 긁게 만든다.
     *
     * <p>계정 축({@code LOGIN_ACCOUNT} 같은)이 없는 이유는 공개 API 라 식별할 계정 자체가 없어서다.
     * IP 한 축만 건다 — 한도를 넉넉하게(분당 120) 잡은 근거는 {@link RateLimiter.Policy#AD_METRIC} 주석에 있다.
     */
    private boolean allowMetric(HttpServletRequest request) {
        return rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.AD_METRIC);
    }

    // 내 광고 신청 내역 (사업자용)
    @GetMapping("/my")
    public ApiResponse<List<AdvertisementResponse>> getMyAds() {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        return ApiResponse.success(advertisementService.getMyAds(member), "조회 성공");
    }

    // 전체 광고 목록 (관리자용)
    // search: 가게 이름 부분 일치. 비우면 전건.
    // 예전에는 프론트가 받은 페이지 안에서만 필터링해 다른 페이지의 광고가 검색되지 않았다 —
    // 검색을 서버로 옮긴 이유는 AdvertisementRepository#searchForAdmin 주석 참고.
    @GetMapping("/admin/all")
    public ApiResponse<Page<AdvertisementResponse>> getAllAds(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateAdminAuth(member);
        return ApiResponse.success(advertisementService.getAllAds(page, size, search), "조회 성공");
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
