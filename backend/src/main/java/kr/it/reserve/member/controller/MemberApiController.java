package kr.it.reserve.member.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.member.dto.LocationUpdateRequest;
import kr.it.reserve.member.dto.MemberResponse;
import kr.it.reserve.member.dto.MemberUpdateRequest;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.lifecycle.dto.MemberWithdrawalReadiness;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

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

    // 위치(위도/경도) 등록 — 거리순 가게 정렬용. Geolocation 거부/미지원 시 주소 검색 폴백으로 호출
    @PatchMapping("/me/location")
    public ApiResponse<MemberResponse> updateLocation(@RequestBody LocationUpdateRequest body) {
        Member member = SecurityUtil.getCurrentMember("인증된 사용자 정보를 찾을 수 없습니다.");
        MemberResponse updated = memberService.updateLocation(member.getId(), body);
        return ApiResponse.success(updated, "위치가 등록되었습니다.");
    }

    // 회원 탈퇴
    @GetMapping("/withdrawal-readiness")
    public ApiResponse<MemberWithdrawalReadiness> getWithdrawalReadiness() {
        Member member = SecurityUtil.getCurrentMember("탈퇴 준비 상태를 확인할 권한이 없습니다.");
        return ApiResponse.success(
                memberService.getWithdrawalReadiness(member.getId()),
                "탈퇴 준비 상태 조회 성공");
    }

    @DeleteMapping("/delete")
    public ApiResponse<Void> deleteMember(HttpServletRequest request, HttpServletResponse response) {
        Member member = SecurityUtil.getCurrentMember("탈퇴 권한이 없습니다.");
        memberService.deleteMember(member.getId());
        CookieUtil.deleteCookie(request, response, "access_token");
        CookieUtil.deleteCookie(request, response, "refresh_token");
        return ApiResponse.success(null, "회원 탈퇴가 완료되었습니다.");
    }
}
