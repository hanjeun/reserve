package kr.it.reserve.chat.controller;

import jakarta.validation.Valid;
import kr.it.reserve.chat.dto.ChatIntroRequest;
import kr.it.reserve.chat.dto.ChatIntroResponse;
import kr.it.reserve.chat.service.ChatIntroService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 고객지원 첫 안내(인사말 + 자동 문답) 저장 — 관리자 전용. 조회는 손님과 같은 GET /api/chat/intro/support 를 쓴다. */
@RestController
@RequestMapping("/api/admin/chat/intro")
@RequiredArgsConstructor
public class AdminChatIntroController {

    private final ChatIntroService introService;

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    public ResponseEntity<ApiResponse<ChatIntroResponse>> updateSupport(@Valid @RequestBody ChatIntroRequest request) {
        Member admin = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                introService.updateSupportIntro(admin, request), "고객지원 채팅 설정을 저장했습니다."));
    }

    /** 고객지원 채팅 사진 올리기. 돌려준 주소를 PUT 의 avatarUrl 로 저장해야 적용된다. */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/avatar")
    public ResponseEntity<ApiResponse<Map<String, String>>> uploadAvatar(@RequestParam("image") MultipartFile image) {
        Member admin = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                Map.of("url", introService.uploadSupportAvatar(admin, image)), "사진을 올렸습니다."));
    }
}
