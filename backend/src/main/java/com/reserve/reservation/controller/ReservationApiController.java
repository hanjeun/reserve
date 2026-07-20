package com.reserve.reservation.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.ReservationException;
import com.reserve.global.ratelimit.IpExtractor;
import com.reserve.global.ratelimit.RateLimiter;
import com.reserve.member.entity.Member;
import com.reserve.reservation.dto.ReservationCreateRequest;
import com.reserve.reservation.dto.ReservationResponse;
import com.reserve.reservation.dto.ReservationUpdateRequest;
import com.reserve.reservation.dto.SlotAvailabilityResponse;
import com.reserve.reservation.service.ReservationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/reservations")
public class ReservationApiController {

    private final ReservationService reservationService;
    private final RateLimiter rateLimiter;

    // --- 일반 사용자 API ---

    @PostMapping
    public ResponseEntity<ApiResponse<ReservationResponse>> createReservation(
            @Valid @RequestBody ReservationCreateRequest request,
            HttpServletRequest httpRequest) {
        String ip = IpExtractor.extract(httpRequest);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.RESERVATION_CREATE)) {
            throw new ReservationException("예약 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        ReservationResponse reservation = reservationService.createReservation(request, SecurityUtil.getCurrentMember());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(reservation, "예약이 신청되었습니다."));
    }

    @GetMapping({"/my", "/my-reservations"})
    public ResponseEntity<ApiResponse<List<ReservationResponse>>> getMyReservations() {
        List<ReservationResponse> reservations = reservationService.getMyReservations(SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(reservations, "내 예약 목록 조회 성공"));
    }

    @GetMapping("/my/store/{storeId}/completed")
    public ResponseEntity<ApiResponse<ReservationResponse>> getMyLatestCompletedForStore(@PathVariable Long storeId) {
        ReservationResponse reservation = reservationService.getLatestCompletedReservationForStore(SecurityUtil.getCurrentMember(), storeId);
        return ResponseEntity.ok(ApiResponse.success(reservation, "조회 성공"));
    }

    // QR 체크인용 토큰 발급 — 본인 예약만 가능
    @GetMapping("/{id}/qr-token")
    public ResponseEntity<ApiResponse<Map<String, String>>> getQrCheckinToken(@PathVariable Long id) {
        String token = reservationService.generateQrCheckinToken(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(Map.of("token", token), "QR 토큰 발급 성공"));
    }

    // 예약 날짜 선택 시 실시간 시간대별 가능 여부 조회 (공개 API — 로그인 불필요)
    @GetMapping("/availability")
    public ResponseEntity<ApiResponse<List<SlotAvailabilityResponse>>> getAvailability(
            @RequestParam Long storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        List<SlotAvailabilityResponse> slots = reservationService.getAvailability(storeId, date);
        return ResponseEntity.ok(ApiResponse.success(slots, "시간대별 예약 가능 여부 조회 성공"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ReservationResponse>> getReservation(@PathVariable Long id) {
        ReservationResponse reservation = reservationService.getReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(reservation, "예약 상세 조회 성공"));
    }

    // 예약 수정 (사용자 본인) — 날짜/시간/인원/요청사항 변경. status는 서버가 재승인 규칙대로 결정하므로 요청값은 무시.
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<ReservationResponse>> updateReservation(
            @PathVariable Long id,
            @Valid @RequestBody ReservationUpdateRequest request) {
        ReservationResponse reservation = reservationService.updateReservation(id, request, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(reservation, "예약이 변경되었습니다."));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<Void>> cancelReservation(@PathVariable Long id) {
        reservationService.cancelReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 취소되었습니다."));
    }

    @DeleteMapping("/{id}/remove")
    public ResponseEntity<ApiResponse<Void>> removeReservation(@PathVariable Long id) {
        reservationService.removeReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 목록에서 제거되었습니다."));
    }

    // --- 사업자용 API ---

    @GetMapping("/store")
    public ResponseEntity<ApiResponse<Page<ReservationResponse>>> getStoreReservations(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "100") int size) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        Page<ReservationResponse> reservations = reservationService.getStoreReservations(member, page, size);
        return ResponseEntity.ok(ApiResponse.success(reservations, "가게 예약 목록 조회 성공"));
    }

    @PatchMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<Void>> approveReservation(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.approveReservation(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 승인되었습니다."));
    }

    @PatchMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<Void>> rejectReservation(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        String reason = (body != null) ? body.get("rejectionReason") : null;
        reservationService.rejectReservation(id, member, reason);
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 거절되었습니다."));
    }

    @PatchMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<Void>> completeReservation(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.completeReservation(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "이용 완료 처리되었습니다."));
    }

    @PatchMapping("/{id}/no-show")
    public ResponseEntity<ApiResponse<Void>> markNoShow(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.markNoShow(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "노쇼 처리되었습니다."));
    }

    // QR 스캔을 통한 자동 체크인 — 스캔 즉시 CONFIRMED로 자동 승인
    @PostMapping("/qr-checkin")
    public ResponseEntity<ApiResponse<ReservationResponse>> checkInByQrToken(@RequestBody Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            throw new ReservationException("QR 토큰이 없습니다.", HttpStatus.BAD_REQUEST);
        }
        ReservationResponse reservation = reservationService.checkInByQrToken(token, member);
        return ResponseEntity.ok(ApiResponse.success(reservation, "체크인되었습니다."));
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없습니다.");
        }
    }
}
