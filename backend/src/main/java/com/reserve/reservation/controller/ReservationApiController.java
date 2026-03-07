package com.reserve.reservation.controller;

import com.reserve.config.util.SecurityUtil;
import com.reserve.global.common.ApiResponse;
import com.reserve.global.error.ReservationException;
import com.reserve.member.entity.Member;
import com.reserve.reservation.dto.ReservationCreateRequest;
import com.reserve.reservation.dto.ReservationResponse;
import com.reserve.reservation.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/reservations")
public class ReservationApiController {

    private final ReservationService reservationService;

    // --- 일반 사용자 API ---

    @PostMapping
    public ResponseEntity<ApiResponse<ReservationResponse>> createReservation(@Valid @RequestBody ReservationCreateRequest request) {
        ReservationResponse reservation = reservationService.createReservation(request, SecurityUtil.getCurrentMember());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(reservation, "예약이 신청되었습니다."));
    }

    @GetMapping({"/my", "/my-reservations"})
    public ResponseEntity<ApiResponse<List<ReservationResponse>>> getMyReservations() {
        List<ReservationResponse> reservations = reservationService.getMyReservations(SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(reservations, "내 예약 목록 조회 성공"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ReservationResponse>> getReservation(@PathVariable Long id) {
        ReservationResponse reservation = reservationService.getReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(reservation, "예약 상세 조회 성공"));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<Void>> cancelReservation(@PathVariable Long id) {
        reservationService.cancelReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 취소되었습니다."));
    }

    // --- 사업자용 API ---

    /**
     * 내 가게 예약 목록 전체 조회 (사장님 전용)
     * 사업자가 소유한 모든 가게의 예약을 최신순으로 반환
     */
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

    // --- 공통 유틸리티 메서드 ---

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없습니다.");
        }
    }
}