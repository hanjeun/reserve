package com.reserve.favorite.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.favorite.dto.FavoriteDto;
import com.reserve.favorite.service.FavoriteService;
import com.reserve.global.common.ApiResponse;
import com.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/favorites")
@RequiredArgsConstructor
public class FavoriteApiController {

    private final FavoriteService favoriteService;

    /**
     * [기능] 찜하기 토글 (추가/삭제)
     */
    @PostMapping("/toggle/{storeId}")
    public ApiResponse<FavoriteDto.ToggleResponse> toggleFavorite(@PathVariable Long storeId) {
        Member member = SecurityUtil.getCurrentMember("찜 기능을 이용하려면 로그인이 필요합니다.");
        FavoriteDto.ToggleResponse response = favoriteService.toggleFavorite(storeId, member);
        String message = response.isFavorite() ? "찜 목록에 추가되었습니다." : "찜 목록에서 삭제되었습니다.";
        return ApiResponse.success(response, message);
    }

    /**
     * [기능] 찜 상태 확인
     */
    @GetMapping("/status/{storeId}")
    public ApiResponse<FavoriteDto.StatusResponse> getFavoriteStatus(@PathVariable Long storeId) {
        // 비로그인 상태도 허용하기 위해 Optional하게 멤버 획득 시도
        Member member = null;
        try {
            member = SecurityUtil.getCurrentMember("");
        } catch (Exception e) {
            // 비로그인 시 member는 null로 유지
        }

        FavoriteDto.StatusResponse response = favoriteService.getFavoriteStatus(storeId, member);
        return ApiResponse.success(response, "찜 상태 조회 성공");
    }

    /**
     * [기능] 내 찜 목록 조회
     */
    @GetMapping("/my")
    public ApiResponse<List<FavoriteDto.Response>> getMyFavorites() {
        Member member = SecurityUtil.getCurrentMember("찜 목록을 조회하려면 로그인이 필요합니다.");
        List<FavoriteDto.Response> favorites = favoriteService.getMyFavorites(member);
        return ApiResponse.success(favorites, "내 찜 목록 조회 성공");
    }
}