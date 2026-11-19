package kr.it.reserve.reservation.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.reservation.dto.NoShowMemberResponse;
import kr.it.reserve.reservation.service.ReservationNoShowRestriction;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reservations/store/no-show-members")
@RequiredArgsConstructor
public class StoreNoShowMembersController {
    private final ReservationNoShowRestriction restrictions;

    @GetMapping({"", "/{storeId}"})
    public ResponseEntity<ApiResponse<Page<NoShowMemberResponse>>> members(@PathVariable(required = false) Long storeId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) @Size(max = 100) String search,
            @RequestParam(defaultValue = "all") String filter, @RequestParam(defaultValue = "recent") String sort) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                restrictions.getNoShowMembers(SecurityUtil.getCurrentMember(), storeId, search, filter, sort, page, size),
                "노쇼 인원 조회 성공"));
    }

    @PutMapping("/{storeId}/{memberId}/restriction")
    public ApiResponse<Void> restrict(@PathVariable Long storeId, @PathVariable Long memberId,
            @Valid @RequestBody RestrictionRequest request) {
        restrictions.restrict(SecurityUtil.getCurrentMember(), storeId, memberId, request.days(), request.permanent(), request.reason());
        return ApiResponse.success(null, "이 가게의 새 예약을 제한했어요.");
    }

    @DeleteMapping("/{storeId}/restrictions/{restrictionId}")
    public ApiResponse<Void> release(@PathVariable Long storeId, @PathVariable Long restrictionId) {
        restrictions.release(SecurityUtil.getCurrentMember(), storeId, restrictionId);
        return ApiResponse.success(null, "수동 예약 제한을 해제했어요.");
    }

    public record RestrictionRequest(Integer days, boolean permanent, @NotBlank @Size(max = 200) String reason) { }
}
