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

    /**
     * 달력용 월 단위 조회 (공개 API — 로그인 불필요).
     *
     * <p><b>{@code month} 를 {@code YearMonth} 로 바인딩하지 않는 이유</b> — 형식이 틀렸을 때
     * 스프링이 {@code MethodArgumentTypeMismatchException} 을 던지고, 그건 이 프로젝트의
     * {@code ApiResponse} 에러 규격을 타지 않는다. 프론트가 처리 못 하는 모양의 400 이 나가느니
     * 직접 파싱해서 <b>다른 400 과 같은 모양</b>으로 돌려준다.
     * ({@code StoreCreateRequest.openDate} 가 String 인 것과 같은 이유다.)
     */
    @GetMapping("/calendar")
    public ResponseEntity<ApiResponse<List<CalendarDayResponse>>> getMonthCalendar(
            @RequestParam Long storeId,
            @RequestParam String month) {
        YearMonth target;
        try {
            target = YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new ReservationException("month 는 YYYY-MM 형식이어야 합니다.", HttpStatus.BAD_REQUEST);
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
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        Page<ReservationResponse> reservations = reservationService.getStoreReservations(
                member, page, size, search, parseReservationStatus(status));
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

    /**
     * 확정된 예약을 가게가 취소한다 (2026-08-11 신설). 전액 환불이 함께 실행된다.
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
        return ResponseEntity.ok(ApiResponse.success(null, "예약이 취소되었습니다. 예약금은 전액 환불됩니다."));
    }

    /** 승인 되돌리기 — 오조작 정정용. 10분 이내만 허용되고 이용자에게 승인 취소 메일이 나간다. */
    @PatchMapping("/{id}/undo-approve")
    public ResponseEntity<ApiResponse<Void>> undoApprove(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.undoApprove(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "승인을 되돌렸습니다."));
    }

    /** 이용완료 되돌리기 — 오조작 정정용. 10분 이내만 허용. */
    @PatchMapping("/{id}/undo-complete")
    public ResponseEntity<ApiResponse<Void>> undoComplete(@PathVariable Long id) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        reservationService.undoComplete(id, member);
        return ResponseEntity.ok(ApiResponse.success(null, "이용완료를 되돌렸습니다."));
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

    // QR 스캔을 통한 실제 방문 기록 — 승인 상태는 바꾸지 않고 checkedInAt만 기록
    //
    // ★ 2026-08-19 레이트리밋 추가. 이 엔드포인트는 실제 방문 시각을 기록하는 상태 변경 API 인데
    //   호출 횟수 제한이 전혀 없었다. 토큰 자체는 서명돼 있어 위조는 불가능하지만, 유출된 토큰을
    //   스크립트로 쏟아붓거나 응답 문구 차이로 예약 상태를 캐내는 건 막을 게 없었다.
    //   한도 근거는 RateLimiter.Policy#QR_CHECKIN 주석 참고.
    @PostMapping("/qr-checkin")
    public ResponseEntity<ApiResponse<QrCheckinResponse>> checkInByQrToken(
            @RequestBody Map<String, String> body,
            HttpServletRequest httpRequest) {
        Member member = SecurityUtil.getCurrentMember();
        validateBusinessAuth(member);
        if (!rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.QR_CHECKIN)) {
            throw new ReservationException("QR 체크인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
                    HttpStatus.TOO_MANY_REQUESTS);
        }
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            throw new ReservationException("QR 토큰이 없습니다.", HttpStatus.BAD_REQUEST);
        }
        QrCheckinResponse result = reservationService.checkInByQrToken(token, member);
        return ResponseEntity.ok(ApiResponse.success(
                result, result.isAlreadyCheckedIn() ? "이미 체크인된 예약입니다." : "체크인되었습니다."));
    }

    private void validateBusinessAuth(Member member) {
        if (!member.isBusiness() && !member.isAdmin()) {
            throw ReservationException.forbidden("사업자 권한이 없습니다.");
        }
    }

    private Reservation.ReservationStatus parseReservationStatus(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) return null;
        try {
            return Reservation.ReservationStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ReservationException("올바르지 않은 예약 상태입니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
