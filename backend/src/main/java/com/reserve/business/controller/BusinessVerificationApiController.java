package com.reserve.business.controller;

import com.reserve.business.dto.BusinessVerificationRequest;
import com.reserve.business.dto.BusinessVerificationResponse;
import com.reserve.business.entity.BusinessVerification.VerificationStatus;
import com.reserve.business.service.BusinessVerificationService;
import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.BizVerificationException;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/business-verification")
@RequiredArgsConstructor
public class BusinessVerificationApiController {

    private final BusinessVerificationService verificationService;

    /**
     * 관리자 권한 체크 공통 메서드
     */
    private void validateAdmin() {
        if (SecurityUtil.getCurrentMember().getRole() != Role.ADMIN) {
            throw new BizVerificationException("관리자만 접근 가능한 메뉴입니다.", HttpStatus.FORBIDDEN);
        }
    }

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
    @GetMapping("/admin/pending")
    public ApiResponse<Page<BusinessVerificationResponse>> getPendingList(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        validateAdmin();
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.success(verificationService.getPendingVerifications(pageable), "대기 목록 조회 성공");
    }

    /**
     * 전체 인증 요청 목록 (관리자용)
     */
    @GetMapping("/admin/list")
    public ApiResponse<Page<BusinessVerificationResponse>> getAllList(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        validateAdmin();
        Pageable pageable = PageRequest.of(page, size);

        if (status != null && !status.isEmpty()) {
            VerificationStatus verificationStatus = VerificationStatus.valueOf(status.toUpperCase());
            return ApiResponse.success(verificationService.getVerificationsByStatus(verificationStatus, pageable), "필터 조회 성공");
        }
        return ApiResponse.success(verificationService.getAllVerifications(pageable), "전체 목록 조회 성공");
    }

    /**
     * 인증 요청 상세 조회 (관리자용)
     */
    @GetMapping("/admin/{id}")
    public ApiResponse<BusinessVerificationResponse> getDetail(@PathVariable Long id) {
        validateAdmin();
        return ApiResponse.success(verificationService.getVerificationDetail(id), "상세 조회 성공");
    }

    /**
     * 사업자 인증 승인 (관리자용)
     */
    @PostMapping("/admin/{id}/approve")
    public ApiResponse<BusinessVerificationResponse> approve(@PathVariable Long id) {
        validateAdmin();
        Member admin = SecurityUtil.getCurrentMember();
        return ApiResponse.success(verificationService.approveVerification(id, admin), "사업자 인증이 승인되었습니다.");
    }

    /**
     * 사업자 인증 거절 (관리자용)
     */
    @PostMapping("/admin/{id}/reject")
    public ApiResponse<BusinessVerificationResponse> reject(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        validateAdmin();
        Member admin = SecurityUtil.getCurrentMember();
        String reason = body.get("reason");
        return ApiResponse.success(verificationService.rejectVerification(id, admin, reason), "사업자 인증이 거절되었습니다.");
    }

    /**
     * 대기중인 인증 요청 수 (관리자용)
     */
    @GetMapping("/admin/pending-count")
    public ApiResponse<Long> getPendingCount() {
        validateAdmin();
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
     */
    @PostMapping("/resign")
    public ApiResponse<Void> resignBusinessRole() {
        verificationService.resignBusinessRole(SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "사업자 자격이 포기되었습니다.");
    }

    /**
     * 사업자 자격 취소 (관리자)
     */
    @PostMapping("/admin/{memberId}/revoke")
    public ApiResponse<Void> revokeBusinessRole(@PathVariable Long memberId) {
        validateAdmin();
        verificationService.revokeBusinessRole(memberId, SecurityUtil.getCurrentMember());
        return ApiResponse.success(null, "사업자 자격이 취소되었습니다.");
    }
}