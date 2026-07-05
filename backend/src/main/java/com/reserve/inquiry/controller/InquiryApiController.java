package com.reserve.inquiry.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.InquiryException;
import com.reserve.inquiry.dto.InquiryDto;
import com.reserve.inquiry.service.InquiryService;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/inquiries")
public class InquiryApiController {

    private final InquiryService inquiryService;

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

    // 문의 작성 - 로그인 안 해도 가능(게스트). 로그인 상태면 회원으로 귀속, 아니면 요청의 guestName/guestEmail을 서비스 계층에서 검증
    @PostMapping
    public ApiResponse<InquiryDto.InquiryResponse> createInquiry(@RequestBody InquiryDto.InquiryRequest request) {
        Long memberId = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        InquiryDto.InquiryResponse response = inquiryService.createInquiry(memberId, request);
        return ApiResponse.success(response, "문의가 성공적으로 등록되었습니다.");
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