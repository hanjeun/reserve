package kr.it.reserve.inquiry.controller;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.inquiry.dto.InquiryDto;
import kr.it.reserve.inquiry.service.InquiryService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/inquiries")
public class InquiryApiController {

    private final InquiryService inquiryService;
    private final RateLimiter rateLimiter;

    // 관리자 권한 체크 공통 로직
    private void validateAdmin() {
        Member member = SecurityUtil.getCurrentMember("인증 정보가 없습니다.");
        if (member.getRole() != Role.ADMIN) {
            throw new InquiryException("관리자 권한이 필요한 서비스입니다.", HttpStatus.FORBIDDEN);
        }
    }

    // 내 문의 목록 조회
    @GetMapping("/my")
    public ApiResponse<Page<InquiryDto.InquiryResponse>> getMyInquiries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        Page<InquiryDto.InquiryResponse> inquiries = inquiryService.getMyInquiries(memberId, page, size);
        return ApiResponse.success(inquiries, "내 문의 목록 조회 성공");
    }

    // 전체 문의 목록 조회 (관리자용)
    @GetMapping("/admin/all")
    public ApiResponse<Page<InquiryDto.InquiryResponse>> getAllInquiries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        validateAdmin();
        Page<InquiryDto.InquiryResponse> inquiries = inquiryService.getAllInquiries(page, size);
        return ApiResponse.success(inquiries, "전체 문의 목록 조회 성공");
    }

    // 문의 상세 조회 (사용자 본인)
    @GetMapping("/{inquiryId}")
    public ApiResponse<InquiryDto.InquiryResponse> getInquiry(@PathVariable Long inquiryId) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        InquiryDto.InquiryResponse inquiry = inquiryService.getInquiry(inquiryId, memberId);
        return ApiResponse.success(inquiry, "문의 상세 조회 성공");
    }

    // 문의 상세 조회 (관리자용)
    @GetMapping("/admin/{inquiryId}")
    public ApiResponse<InquiryDto.InquiryResponse> getInquiryForAdmin(@PathVariable Long inquiryId) {
        validateAdmin();
        InquiryDto.InquiryResponse inquiry = inquiryService.getInquiryForAdmin(inquiryId);
        return ApiResponse.success(inquiry, "관리자용 상세 조회 성공");
    }

    /**
     * 문의 작성 — 로그인 안 해도 가능(게스트). 로그인 상태면 회원으로 귀속,
     * 아니면 요청의 guestName/guestEmail 을 서비스 계층에서 검증한다.
     *
     * <h3>★ 레이트리밋이 필수인 이유 (2026-08-25 추가)</h3>
     * 이 엔드포인트는 <b>비로그인 허용</b>이면서 저장만 하는 게 아니라
     * {@code InquiryService#createInquiry} 가 <b>요청마다 알림 메일을 한 통 보낸다.</b>
     * 상한이 없던 동안 유일한 방어는 nginx 의 IP당 20r/s 뿐이었고, 그 안에서도
     * 한 IP 로 하루 백만 단위 요청과 그만큼의 메일 발송이 가능했다.
     * 피해는 DB 가 아니라 <b>발신 도메인 평판</b>이다 —
     * 근거는 {@link RateLimiter.Policy#INQUIRY_CREATE} 주석에 있다.
     *
     * <p>여기서는 429 를 그대로 돌려준다. 광고 지표(조용히 무시)와 다른 이유는,
     * 문의는 <b>사용자가 결과를 기다리는 동작</b>이라 조용히 버리면
     * "보냈는데 답이 없다"가 되기 때문이다.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<InquiryDto.InquiryResponse>> createInquiry(
            @RequestBody InquiryDto.InquiryRequest request,
            HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.INQUIRY_CREATE)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("문의가 너무 많습니다. 잠시 후 다시 시도해주세요."));
        }
        Long memberId = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        InquiryDto.InquiryResponse response = inquiryService.createInquiry(memberId, request);
        return ResponseEntity.ok(ApiResponse.success(response, "문의가 성공적으로 등록되었습니다."));
    }

    // 문의 삭제 (사용자 본인)
    @DeleteMapping("/{inquiryId}")
    public ApiResponse<Void> deleteInquiry(@PathVariable Long inquiryId) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        inquiryService.deleteInquiry(inquiryId, memberId);
        return ApiResponse.success(null, "문의가 삭제되었습니다.");
    }

    // 답변 작성 (관리자 전용)
    @PostMapping("/{inquiryId}/answer")
    public ApiResponse<InquiryDto.InquiryResponse> answerInquiry(
            @PathVariable Long inquiryId,
            @RequestBody InquiryDto.AnswerRequest request) {
        validateAdmin();
        InquiryDto.InquiryResponse response = inquiryService.answerInquiry(inquiryId, request);
        return ApiResponse.success(response, "문의 답변이 등록되었습니다.");
    }

    // 문의 삭제 (관리자용)
    @DeleteMapping("/admin/{inquiryId}")
    public ApiResponse<Void> deleteInquiryAsAdmin(@PathVariable Long inquiryId) {
        validateAdmin();
        inquiryService.deleteInquiryAsAdmin(inquiryId);
        return ApiResponse.success(null, "관리자 권한으로 문의를 삭제했습니다.");
    }

    // 미답변 문의 개수 (내 것)
    @GetMapping("/pending-count")
    public ApiResponse<Long> getPendingCount() {
        Long memberId = SecurityUtil.getCurrentMemberId();
        Long count = inquiryService.getPendingInquiryCount(memberId);
        return ApiResponse.success(count, "내 미답변 문의 개수 조회 성공");
    }
}