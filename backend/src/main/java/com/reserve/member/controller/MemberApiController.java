package com.reserve.member.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.member.dto.MemberResponse;
import com.reserve.member.dto.MemberUpdateRequest;
import com.reserve.member.entity.Member;
import com.reserve.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/member")
public class MemberApiController {

    private final MemberService memberService;

    // 내 정보 조회 (SecurityContext의 id로 DB 조회 - 최신 정보 보장)
    @GetMapping("/me")
    public ApiResponse<MemberResponse> getCurrentMember() {
        Long memberId = SecurityUtil.getCurrentMember("인증된 사용자 정보를 찾을 수 없습니다.").getId();
        MemberResponse member = memberService.getMemberResponse(memberId);
        return ApiResponse.success(member, "내 정보 조회 성공");
    }

    // 내 정보 수정
    @PutMapping("/update")
    public ApiResponse<MemberResponse> updateMember(@RequestBody MemberUpdateRequest request) {
        Member member = SecurityUtil.getCurrentMember("수정 권한이 없습니다.");
        MemberResponse updated = memberService.updateMember(member.getId(), request);
        return ApiResponse.success(updated, "회원 정보가 성공적으로 수정되었습니다.");
    }

    // 프로필 이미지 업로드
    @PostMapping("/profile-image")
    public ApiResponse<MemberResponse> uploadProfileImage(@RequestParam("image") MultipartFile image) {
        Member member = SecurityUtil.getCurrentMember("수정 권한이 없습니다.");
        MemberResponse updated = memberService.updateProfileImage(member.getId(), image);
        return ApiResponse.success(updated, "프로필 이미지가 업데이트되었습니다.");
    }

    // 프로필 이미지 삭제 (기본 이미지로 초기화)
    @DeleteMapping("/profile-image")
    public ApiResponse<MemberResponse> deleteProfileImage() {
        Member member = SecurityUtil.getCurrentMember("수정 권한이 없습니다.");
        MemberResponse updated = memberService.deleteProfileImage(member.getId());
        return ApiResponse.success(updated, "프로필 이미지가 초기화되었습니다.");
    }

    // 마케팅 수신 동의 토글 (선택 동의 — 가입 후 언제든 변경 가능)
    @PatchMapping("/me/marketing-consent")
    public ApiResponse<MemberResponse> updateMarketingConsent(@RequestBody java.util.Map<String, Boolean> body) {
        Member member = SecurityUtil.getCurrentMember("인증된 사용자 정보를 찾을 수 없습니다.");
        boolean agreed = Boolean.TRUE.equals(body.get("marketingAgreed"));
        MemberResponse updated = memberService.updateMarketingConsent(member.getId(), agreed);
        return ApiResponse.success(updated, agreed ? "마케팅 수신에 동의했습니다." : "마케팅 수신 동의를 철회했습니다.");
    }

    // 회원 탈퇴
    @DeleteMapping("/delete")
    public ApiResponse<Void> deleteMember() {
        Member member = SecurityUtil.getCurrentMember("탈퇴 권한이 없습니다.");
        memberService.deleteMember(member.getId());
        return ApiResponse.success(null, "회원 탈퇴가 완료되었습니다.");
    }
}
