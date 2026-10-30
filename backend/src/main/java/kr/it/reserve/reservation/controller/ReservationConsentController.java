package kr.it.reserve.reservation.controller;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.reservation.service.ReservationConsentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/reservations/notices")
public class ReservationConsentController {
    private final ReservationConsentService consents;
    @GetMapping("/{storeId}")
    public ResponseEntity<ApiResponse<ReservationConsentService.Notice>> notice(@PathVariable Long storeId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(consents.notice(storeId), "예약 정보 제공 안내예요."));
    }
}
