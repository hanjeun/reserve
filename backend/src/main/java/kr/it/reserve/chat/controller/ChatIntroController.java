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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채팅 첫 안내(인사말 + 자동 문답). 채팅 자체가 로그인 기능이라 조회도 로그인 사용자만 한다.
 * 저장은 가게 사장님 본인만 — 소유 검사는 서비스가 한다.
 */
@RestController
@RequestMapping("/api/chat/intro")
@RequiredArgsConstructor
public class ChatIntroController {

    private final ChatIntroService introService;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/support")
    public ResponseEntity<ApiResponse<ChatIntroResponse>> support() {
        return ResponseEntity.ok(ApiResponse.success(introService.getSupportIntro(), "고객지원 안내 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stores/{storeId}")
    public ResponseEntity<ApiResponse<ChatIntroResponse>> store(@PathVariable Long storeId) {
        return ResponseEntity.ok(ApiResponse.success(introService.getStoreIntro(storeId), "가게 안내 조회 성공"));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/stores/{storeId}")
    public ResponseEntity<ApiResponse<ChatIntroResponse>> updateStore(
            @PathVariable Long storeId,
            @Valid @RequestBody ChatIntroRequest request) {
        Member me = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        return ResponseEntity.ok(ApiResponse.success(
                introService.updateStoreIntro(me, storeId, request), "자동 응답을 저장했습니다."));
    }
}
