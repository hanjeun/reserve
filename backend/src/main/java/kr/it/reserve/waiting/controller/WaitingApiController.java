package kr.it.reserve.waiting.controller;

import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.waiting.dto.CreateWaitingRequest;
import kr.it.reserve.waiting.dto.UpdateWaitingStatusRequest;
import kr.it.reserve.waiting.dto.UpdateWaitingIntakeRequest;
import kr.it.reserve.waiting.dto.WaitingBoardResponse;
import kr.it.reserve.waiting.dto.WaitingEntryResponse;
import kr.it.reserve.waiting.service.WaitingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stores/{storeId}/waiting")
@PreAuthorize("hasAnyRole('BUSINESS', 'ADMIN')")
@RequiredArgsConstructor
public class WaitingApiController {
    private final WaitingService waiting;

    @GetMapping
    public ResponseEntity<ApiResponse<WaitingBoardResponse>> board(@PathVariable Long storeId) {
        return ResponseEntity.ok(ApiResponse.success(
                waiting.getBoard(SecurityUtil.getCurrentMember(), storeId), "대기 접수를 불러왔어요."));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<WaitingEntryResponse>> create(@PathVariable Long storeId,
                                                                   @Valid @RequestBody CreateWaitingRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                waiting.create(SecurityUtil.getCurrentMember(), storeId, request), "대기 접수를 등록했어요."));
    }

    @PatchMapping("/{entryId}/status")
    public ResponseEntity<ApiResponse<WaitingEntryResponse>> updateStatus(@PathVariable Long storeId,
                                                                         @PathVariable Long entryId,
                                                                         @Valid @RequestBody UpdateWaitingStatusRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                waiting.updateStatus(SecurityUtil.getCurrentMember(), storeId, entryId, request), "대기 상태를 변경했어요."));
    }

    @PatchMapping("/intake")
    public ResponseEntity<ApiResponse<WaitingBoardResponse>> updateIntake(@PathVariable Long storeId,
                                                                         @Valid @RequestBody UpdateWaitingIntakeRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                waiting.updateIntake(SecurityUtil.getCurrentMember(), storeId, request.paused()),
                "웨이팅 접수 상태를 변경했어요."));
    }
}
