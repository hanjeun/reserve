package kr.it.reserve.reservation.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.reservation.retention.ReservationRetentionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/reservation-retention")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class ReservationRetentionController {
    private final ReservationRetentionService service;
    public record Evidence(@NotNull ReservationRetentionService.Purpose purpose) { }
    public record Hold(@NotNull ReservationRetentionService.Purpose purpose,
            @NotNull @Pattern(regexp="[A-Za-z0-9][A-Za-z0-9_-]{0,79}") String caseReference) { }
    public record Release(@NotNull @Pattern(regexp="[A-Za-z0-9][A-Za-z0-9_-]{0,79}") String caseReference) { }

    @PostMapping("/{id}/evidence")
    public ResponseEntity<ApiResponse<ReservationRetentionService.Evidence>> evidence(@PathVariable Long id, @Valid @RequestBody Evidence request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(service.evidence(id, request.purpose()), "거래 증거를 조회했어요."));
    }
    @GetMapping("/availability")
    public ApiResponse<java.util.Map<String,Boolean>> availability() { return ApiResponse.success(service.availability(), "예약 증거 조회 준비 상태예요."); }
    @PostMapping("/{id}/hold")
    public ApiResponse<ReservationRetentionService.Hold> hold(@PathVariable Long id, @Valid @RequestBody Hold request) {
        return ApiResponse.success(service.hold(id, request.purpose(), request.caseReference()), "예약 증거의 파기를 보류했어요.");
    }
    @PostMapping("/{id}/release")
    public ApiResponse<Void> release(@PathVariable Long id, @Valid @RequestBody Release request) {
        service.release(id, request.caseReference()); return ApiResponse.success(null, "파기 보류를 해제했어요.");
    }
}
