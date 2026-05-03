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
import org.springframework.data.domain.Page;
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

    // 전체 가게 조회 — 페이지네이션 지원
    // page, size 파라미터 있으면 Page 반환, 없으면 기존 List 반환 (하위 호환)
    @GetMapping
    public ApiResponse<?> getAllStores(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "rating") String sort,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "20") int size
    ) {
        if (page != null) {
            Page<StoreResponse> storePage = storeService.searchStoresPaged(keyword, sort, page, size);
            return ApiResponse.success(storePage, "가게 목록 조회 성공");
        }
        // 기존 클라이언트 하위 호환
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

    // 가게 삭제 전 활성 예약 수 조회 (모달 표시용)
    @GetMapping("/{id}/active-reservations-count")
    public ApiResponse<Integer> getActiveReservationsCount(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        int count = storeService.countActiveReservations(id, member);
        return ApiResponse.success(count, "활성 예약 수 조회 성공");
    }

    // 가게 삭제
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStore(
            @PathVariable Long id,
            @RequestParam(defaultValue = "false") boolean force
    ) {
        Member member = SecurityUtil.getCurrentMember("가게 삭제를 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        storeService.deleteStore(id, member, force);
        return ApiResponse.success(null, "가게가 삭제되었습니다.");
    }

    // [중요] 사업자 권한 검증 공통 로직
    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw new StoreException("사업자 권한이 있는 회원만 접근 가능합니다.", HttpStatus.FORBIDDEN);
        }
    }
}