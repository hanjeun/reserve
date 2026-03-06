package com.reserve.store.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.StoreException;
import com.reserve.member.entity.Member;
import com.reserve.store.dto.StoreCreateRequest;
import com.reserve.store.dto.StoreResponse;
import com.reserve.store.dto.StoreUpdateRequest;
import com.reserve.store.service.StoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/stores")
public class StoreApiController {

    private final StoreService storeService;

    // 가게 등록
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<StoreResponse> createStore(@ModelAttribute StoreCreateRequest request) {
        Member member = SecurityUtil.getCurrentMember("가게 등록을 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        StoreResponse store = storeService.createStore(request, member);
        return ApiResponse.success(store, "가게가 성공적으로 등록되었습니다.");
    }

    // 내 가게 목록 조회
    @GetMapping("/my")
    public ApiResponse<List<StoreResponse>> getMyStores() {
        Member member = SecurityUtil.getCurrentMember("내 가게 조회를 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        List<StoreResponse> stores = storeService.getMyStores(member);
        return ApiResponse.success(stores, "내 가게 목록 조회 성공");
    }

    // 전체 가게 조회 (검색 및 정렬)
    @GetMapping
    public ApiResponse<List<StoreResponse>> getAllStores(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "rating") String sort
    ) {
        List<StoreResponse> stores = storeService.searchStores(keyword, sort);
        return ApiResponse.success(stores, "가게 목록 조회 성공");
    }

    // 가게 상세 조회
    @GetMapping("/{id}")
    public ApiResponse<StoreResponse> getStore(@PathVariable Long id) {
        StoreResponse store = storeService.getStore(id);
        return ApiResponse.success(store, "가게 상세 조회 성공");
    }

    // 가게 수정
    @PutMapping("/{id}")
    public ApiResponse<StoreResponse> updateStore(
            @PathVariable Long id,
            @ModelAttribute StoreUpdateRequest request
    ) {
        Member member = SecurityUtil.getCurrentMember("가게 수정을 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        StoreResponse store = storeService.updateStore(id, request, member);
        return ApiResponse.success(store, "가게 정보가 수정되었습니다.");
    }

    // 자동 승인 토글
    @PatchMapping("/{id}/auto-approval")
    public ApiResponse<StoreResponse> toggleAutoApproval(
            @PathVariable Long id,
            @RequestParam boolean enabled
    ) {
        Member member = SecurityUtil.getCurrentMember("가게 수정을 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);
        StoreResponse store = storeService.toggleAutoApproval(id, enabled, member);
        return ApiResponse.success(store, "자동 승인 설정이 변경되었습니다.");
    }

    // 가게 삭제
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStore(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("가게 삭제를 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        storeService.deleteStore(id, member);
        return ApiResponse.success(null, "가게가 삭제되었습니다.");
    }

    // [중요] 사업자 권한 검증 공통 로직
    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw new StoreException("사업자 권한이 있는 회원만 접근 가능합니다.", HttpStatus.FORBIDDEN);
        }
    }
}