package kr.it.reserve.reservation.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.QrCheckinResponse;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
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
            throw new ReservationException("예약 요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        ReservationResponse reservation = reservationService.createReservation(request, SecurityUtil.getCurrentMember());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(reservation, "예약이 신청됐어요."));
    }

    @PostMapping("/requests/result")
    public ResponseEntity<ApiResponse<ReservationResponse>> recoverReservation(
            @Valid @RequestBody ReservationCreateRequest request) {
        Member member = SecurityUtil.getCurrentMember();
        if (!rateLimiter.tryConsume("reservation-result:" + member.getId(), RateLimiter.Policy.PROFILE_READ))
            throw new ReservationException("예약 결과를 잠시 후 다시 확인해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        return ResponseEntity.ok(ApiResponse.success(reservationService.recoverReservation(request, member), "예약 요청 결과를 확인했어요."));
    }

    @GetMapping({"/my", "/my-reservations"})
    public ResponseEntity<ApiResponse<Void>> retiredMyReservations() {
        SecurityUtil.getCurrentMember();
        return ResponseEntity.status(HttpStatus.GONE).cacheControl(CacheControl.noStore())
                .body(ApiResponse.error("예약 조회 방식이 변경됐어요. 화면을 새로고침한 뒤 다시 시도해주세요."));
    }

    @GetMapping({"/my/page", "/my-reservations/page"})
    public ResponseEntity<ApiResponse<Page<ReservationResponse>>> getMyReservationPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Reservation.ReservationStatus status,
            @RequestParam(defaultValue = "recent") String sort) {
        Page<ReservationResponse> reservations = reservationService.getMyReservations(
                SecurityUtil.getCurrentMember(), page, size, search, status, sort);
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

    /** 잘못된 월 형식도 공통 ApiResponse 오류 형식으로 반환하기 위해 직접 파싱한다. */
    @GetMapping("/calendar")
    public ResponseEntity<ApiResponse<List<CalendarDayResponse>>> getMonthCalendar(
            @RequestParam Long storeId,
            @RequestParam String month) {
        YearMonth target;
        try {
            target = YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new ReservationException("month 는 YYYY-MM 형식이어야 해요.", HttpStatus.BAD_REQUEST);
        }
        List<CalendarDayResponse> days = reservationService.getMonthCalendar(storeId, target);
        return ResponseEntity.ok(ApiResponse.success(days, "달력 조회 성공"));
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
        return ResponseEntity.ok(ApiResponse.success(reservation, "예약이 변경됐어요."));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<Void>> cancelReservation(@PathVariable Long id) {
        reservationService.cancelReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 취소됐어요."));
    }

    @DeleteMapping("/{id}/remove")
    public ResponseEntity<ApiResponse<Void>> removeReservation(@PathVariable Long id) {
        reservationService.removeReservation(id, SecurityUtil.getCurrentMember());
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 목록에서 제거됐어요."));
    }

    // --- 사업자용 API ---

    @GetMapping("/store")
    public ResponseEntity<ApiResponse<Page<ReservationResponse>>> getStoreReservations(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long storeId,
            @RequestParam(defaultValue = "recent") String sort) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        Page<ReservationResponse> reservations = reservationService.getStoreReservations(
                member, page, size, search, parseReservationStatus(status), storeId, sort);
        return ResponseEntity.ok(ApiResponse.success(reservations, "가게 예약 목록 조회 성공"));
    }

    @GetMapping("/store/status-summary")
    public ResponseEntity<ApiResponse<kr.it.reserve.reservation.dto.ReservationStatusSummaryResponse>>
            getStoreReservationSummary() {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        return ResponseEntity.ok(ApiResponse.success(
                reservationService.getStoreReservationSummary(member),
                "예약 상태 집계 조회 성공"));
    }

    @PatchMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<Void>> approveReservation(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.approveReservation(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 승인됐어요."));
    }

    @PatchMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<Void>> rejectReservation(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        String reason = (body != null) ? body.get("rejectionReason") : null;
        reservationService.rejectReservation(id, member, reason);
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 거절됐어요."));
    }

    /**
     * 확정된 예약을 가게가 취소한다. 전액 환불이 함께 실행된다.
     *
     * <p>{@code PATCH /{id}/cancel} 과 <b>경로가 다른 이유</b> — 그쪽은 예약자 본인 검증
     * ({@code validateOwnership})을 타서 가게 주인은 403 이다. 같은 엔드포인트에서 분기하면
     * "요청자가 누구냐"에 따라 권한 규칙과 환불 금액이 달라지는 메서드가 되어 위험하다.
     */
    @PatchMapping("/{id}/store-cancel")
    public ResponseEntity<ApiResponse<Void>> cancelReservationByStore(
            @PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        String reason = (body != null) ? body.get("cancelReason") : null;
        reservationService.cancelReservationByStore(id, member, reason);
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 취소됐어요. 예약금은 전액 환불돼요."));
    }

    /** 승인 되돌리기 — 오조작 정정용. 10분 이내만 허용되고 이용자에게 승인 취소 메일이 나간다. */
    @PatchMapping("/{id}/undo-approve")
    public ResponseEntity<ApiResponse<Void>> undoApprove(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.undoApprove(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "승인을 되돌렸어요."));
    }

    /** 이용완료 되돌리기 — 오조작 정정용. 10분 이내만 허용. */
    @PatchMapping("/{id}/undo-complete")
    public ResponseEntity<ApiResponse<Void>> undoComplete(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.undoComplete(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "이용완료를 되돌렸어요."));
    }

    @PatchMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<Void>> completeReservation(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.completeReservation(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "이용 완료 처리됐어요."));
    }

    @PatchMapping("/{id}/no-show")
    public ResponseEntity<ApiResponse<Void>> markNoShow(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.markNoShow(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "노쇼 처리됐어요."));
    }

    // QR 체크인은 승인 상태를 바꾸지 않고 방문 시각만 기록한다. 서명 검증과 별도로 호출량을 제한한다.
    @PostMapping("/qr-checkin")
    public ResponseEntity<ApiResponse<QrCheckinResponse>> checkInByQrToken(
            @RequestBody Map<String, String> body,
            HttpServletRequest httpRequest) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        if (!rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.QR_CHECKIN)) {
            throw new ReservationException("QR 체크인 요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
                    HttpStatus.TOO_MANY_REQUESTS);
        }
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            throw new ReservationException("QR 토큰이 없어요.", HttpStatus.BAD_REQUEST);
        }
        QrCheckinResponse result = reservationService.checkInByQrToken(token, member);
        return ResponseEntity.ok(ApiResponse.success(
                result, result.isAlreadyCheckedIn() ? "이미 체크인된 예약이에요." : "체크인됐어요."));
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없어요.");
        }
    }

    private Reservation.ReservationStatus parseReservationStatus(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) return null;
        try {
            return Reservation.ReservationStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ReservationException("올바르지 않은 예약 상태예요.", HttpStatus.BAD_REQUEST);
        }
    }
}
