package kr.it.reserve.business.controller;

import kr.it.reserve.business.dto.BusinessVerificationRequest;
import kr.it.reserve.business.dto.BusinessVerificationResponse;
import kr.it.reserve.business.entity.BusinessVerification.VerificationStatus;
import kr.it.reserve.business.service.BusinessVerificationService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BizVerificationException;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/business-verification")
@RequiredArgsConstructor
public class BusinessVerificationApiController {

    private static final int MAX_PAGE_SIZE = 100;

    private final BusinessVerificationService verificationService;

    /**
     * 사업자 인증 신청
     */
    @PostMapping("/submit")
    public ApiResponse<BusinessVerificationResponse> submitVerification(@ModelAttribute BusinessVerificationRequest request) {
        Member member = SecurityUtil.getCurrentMember();
        BusinessVerificationResponse response = verificationService.submitVerification(member, request);
        return ApiResponse.success(response, "사업자 인증 신청이 완료되었습니다. 관리자 승인 후 이용 가능합니다.");
    }

    /**
     * 내 인증 상태 조회
     */
    @GetMapping("/my-status")
    public ApiResponse<Object> getMyStatus() {
        Member member = SecurityUtil.getCurrentMember();
        var status = verificationService.getMyVerificationStatus(member);
        return ApiResponse.success(status.orElse(null), "인증 상태 조회 성공");
    }

    /**
     * 대기중인 인증 요청 목록 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/pending")
    public ApiResponse<Page<BusinessVerificationResponse>> getPendingList(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search) {
        return ApiResponse.success(
                verificationService.searchAdminVerifications(
                        VerificationStatus.PENDING, search, boundedPage(page, size)),
                "대기 목록 조회 성공");
    }

    /**
     * 전체 인증 요청 목록 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/list")
    public ApiResponse<Page<BusinessVerificationResponse>> getAllList(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search) {
        VerificationStatus verificationStatus = parseStatus(status);
        return ApiResponse.success(
                verificationService.searchAdminVerifications(
                        verificationStatus, search, boundedPage(page, size)),
                verificationStatus == null ? "전체 목록 조회 성공" : "필터 조회 성공");
    }

    /**
     * 인증 요청 상세 조회 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/{id}")
    public ApiResponse<BusinessVerificationResponse> getDetail(@PathVariable Long id) {
        return ApiResponse.success(verificationService.getVerificationDetail(id), "상세 조회 성공");
    }

    /**
     * 사업자 인증 승인 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/{id}/approve")
    public ApiResponse<BusinessVerificationResponse> approve(@PathVariable Long id) {
        Member admin = SecurityUtil.getCurrentMember();
        return ApiResponse.success(verificationService.approveVerification(id, admin), "사업자 인증이 승인되었습니다.");
    }

    /**
     * 사업자 인증 거절 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/{id}/reject")
    public ApiResponse<BusinessVerificationResponse> reject(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Member admin = SecurityUtil.getCurrentMember();
        String reason = body.get("reason");
        return ApiResponse.success(verificationService.rejectVerification(id, admin, reason), "사업자 인증이 거절되었습니다.");
    }

    /**
     * 대기중인 인증 요청 수 (관리자용)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/pending-count")
    public ApiResponse<Long> getPendingCount() {
        return ApiResponse.success(verificationService.getPendingCount(), "대기 수 조회 성공");
    }

    /**
     * 사업자 인증 신청 수정 (PENDING 상태일 때만)
     */
    @PatchMapping("/update")
    public ApiResponse<BusinessVerificationResponse> updateVerification(@ModelAttribute BusinessVerificationRequest request) {
        Member member = SecurityUtil.getCurrentMember();
        return ApiResponse.success(verificationService.updateVerification(member, request), "수정되었습니다.");
    }

    /**
     * 사업자 인증 신청 취소 (사용자)
     */
    @DeleteMapping("/cancel")
    public ApiResponse<Void> cancelVerification() {
        verificationService.cancelVerification(SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "사업자 인증 신청이 취소되었습니다.");
    }

    /**
     * 사업자 자격 포기 (사업자 본인)
     * BUSINESS 역할만 호출 가능 — SecurityConfig URL 체크 없으므로 메서드 레벨에서 방어
     */
    @PreAuthorize("hasRole('BUSINESS')")
    @PostMapping("/resign")
    public ApiResponse<Void> resignBusinessRole() {
        verificationService.resignBusinessRole(SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "사업자 자격이 포기되었습니다.");
    }

    /**
     * 사업자 자격 취소 (관리자)
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/{memberId}/revoke")
    public ApiResponse<Void> revokeBusinessRole(@PathVariable Long memberId) {
        verificationService.revokeBusinessRole(memberId, SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "사업자 자격이 취소되었습니다.");
    }

    private Pageable boundedPage(int page, int size) {
        return PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(1, size), MAX_PAGE_SIZE));
    }

    private VerificationStatus parseStatus(String status) {
        if (status == null || status.isBlank()) return null;
        try {
            return VerificationStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BizVerificationException(
                    "올바르지 않은 인증 상태입니다.",
                    org.springframework.http.HttpStatus.BAD_REQUEST);
        }
    }
}
