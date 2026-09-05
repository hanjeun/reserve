package kr.it.reserve.store.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.dto.StoreStatisticsResponse;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.service.StoreService;
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
    // - validateBusinessAuth 없음: 기존 소유 가게는 역할 무관하게 볼 수 있어야 함
    //   (사업자 취소 후에도 자기 가게 확인 + 기존 예약 처리 가능해야 하므로)
    // - 가게 생성/수정은 여전히 BUSINESS 역할 필요 (validateBusinessAuth 유지)
    @GetMapping("/my")
    public ApiResponse<List<StoreResponse>> getMyStores() {
        Member member = SecurityUtil.getCurrentMember("내 가게 조회를 위해 로그인이 필요합니다.");
        List<StoreResponse> stores = storeService.getMyStores(member);
        return ApiResponse.success(stores, "내 가게 목록 조회 성공");
    }

    // 전체 가게 조회 — 페이지네이션 지원
    // page, size 파라미터 있으면 Page 반환, 없으면 기존 List 반환 (하위 호환)
    // lat/lng: sort=distance일 때만 사용 (프론트가 Geolocation 또는 회원 등록 좌표를 전달)
    @GetMapping
    public ApiResponse<?> getAllStores(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "rating") String sort,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "20") int size,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng
    ) {
        if (page != null) {
            Page<StoreResponse> storePage = storeService.searchStoresPaged(keyword, sort, page, size, lat, lng);
            return ApiResponse.success(storePage, "가게 목록 조회 성공");
        }
        // 기존 클라이언트 하위 호환
        List<StoreResponse> stores = storeService.searchStores(keyword, sort);
        return ApiResponse.success(stores, "가게 목록 조회 성공");
    }

    // 가게 상세 조회 (공개 API — 공개 정보만 반환)
    @GetMapping("/{id}")
    public ApiResponse<StoreResponse> getStore(@PathVariable Long id) {
        StoreResponse store = storeService.getStore(id);
        return ApiResponse.success(store, "가게 상세 조회 성공");
    }

    // 가게 수정용 데이터 조회 (인증 + 소유자 본인만 — 내부 운영 설정 포함)
    // 미인증 사용자가 URL을 조작해 다른 가게의 수정 데이터를 추적하는 것을 원천 차단
    @GetMapping("/{id}/edit")
    public ApiResponse<StoreResponse> getStoreForEdit(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("가게 수정을 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);
        StoreResponse store = storeService.getStoreForEdit(id, member);
        return ApiResponse.success(store, "가게 수정 정보 조회 성공");
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

    @GetMapping("/{id}/closure-readiness")
    public ApiResponse<StoreClosureReadiness> getClosureReadiness(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("로그인이 필요합니다.");
        validateBusinessAuth(member);
        return ApiResponse.success(
                storeService.getClosureReadiness(id, member),
                "영업 종료 준비 상태 조회 성공");
    }

    // 사업자 "통계 · 분석" 탭 — 기간(range=7d|30d|90d, 기본 30d) 통계 조회
    @GetMapping("/{id}/statistics")
    public ApiResponse<StoreStatisticsResponse> getStoreStatistics(
            @PathVariable Long id,
            @RequestParam(defaultValue = "30d") String range
    ) {
        Member member = SecurityUtil.getCurrentMember("통계 조회를 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);
        StoreStatisticsResponse stats = storeService.getStoreStatistics(id, member, range);
        return ApiResponse.success(stats, "가게 통계 조회 성공");
    }

    // 가게 영업 종료 (거래 원장은 보존하고 공개 노출만 종료)
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStore(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember("가게 영업 종료를 위해 로그인이 필요합니다.");
        validateBusinessAuth(member);

        storeService.deleteStore(id, member);
        return ApiResponse.success(null, "가게 영업이 종료되었습니다.");
    }

    // [중요] 사업자 권한 검증 공통 로직
    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw new StoreException("사업자 권한이 있는 회원만 접근 가능합니다.", HttpStatus.FORBIDDEN);
        }
    }
}
