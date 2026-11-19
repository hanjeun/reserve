package kr.it.reserve.notification.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.notification.service.ReservationNotificationService;
import kr.it.reserve.reservation.dto.ReservationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/chat/notifications")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ReservationNotificationController {
    private final ReservationNotificationService notifications;

    @GetMapping
    public ResponseEntity<ApiResponse<ReservationNotificationService.InboxPage>> inbox(
            @RequestParam(required = false) @Positive Long before) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                ApiResponse.success(notifications.inbox(SecurityUtil.getCurrentMember(), before), "알림을 불러왔어요."));
    }

    @PostMapping(value = "/read", params = "!split")
    public ResponseEntity<ApiResponse<Integer>> read(@Valid @RequestBody ReadRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                ApiResponse.success(notifications.read(SecurityUtil.getCurrentMember(), request.ids()), "읽음으로 표시했어요."));
    }

    @PostMapping(value = "/read", params = "split")
    public ResponseEntity<ApiResponse<ReservationNotificationService.ReadCount>> readWithCount(@Valid @RequestBody ReadRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                ApiResponse.success(notifications.readWithCount(SecurityUtil.getCurrentMember(), request.ids()), "읽음으로 표시했어요."));
    }

    @GetMapping("/{id}/reservation")
    public ResponseEntity<ApiResponse<ReservationResponse>> reservation(@PathVariable @Positive Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                ApiResponse.success(notifications.reservation(SecurityUtil.getCurrentMember(), id), "예약 상세를 불러왔어요."));
    }

    public record ReadRequest(@NotEmpty @Size(max = ReservationNotificationService.PAGE_SIZE)
                              List<@NotNull @Positive Long> ids) {}
}
