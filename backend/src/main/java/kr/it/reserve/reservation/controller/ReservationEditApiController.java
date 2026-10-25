package kr.it.reserve.reservation.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.service.ReservationEditQueryService;
import kr.it.reserve.store.dto.StoreResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/reservations/{id}")
public class ReservationEditApiController {
    private final ReservationEditQueryService queries;
    private final RateLimiter limiter;

    @GetMapping("/edit-store")
    public ApiResponse<StoreResponse> getEditStore(@PathVariable Long id, @RequestParam Long storeId) {
        return ApiResponse.success(queries.getEditStore(id, storeId, readMember()), "예약 변경용 가게 조회 성공");
    }

    @GetMapping("/availability")
    public ApiResponse<List<SlotAvailabilityResponse>> getEditAvailability(@PathVariable Long id, @RequestParam Long storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(queries.getEditAvailability(id, storeId, date, readMember()), "시간대별 예약 가능 여부 조회 성공");
    }

    @GetMapping("/calendar")
    public ApiResponse<List<CalendarDayResponse>> getEditCalendar(@PathVariable Long id, @RequestParam Long storeId,
            @RequestParam String month) {
        YearMonth target;
        try {
            target = YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new ReservationException("month 는 YYYY-MM 형식이어야 해요.", HttpStatus.BAD_REQUEST);
        }
        return ApiResponse.success(queries.getEditCalendar(id, storeId, target, readMember()), "달력 조회 성공");
    }

    private Member readMember() {
        Member member = SecurityUtil.getCurrentMember();
        if (!limiter.tryConsume("reservation-edit:" + member.getId(), RateLimiter.Policy.PROFILE_READ)) {
            throw new ReservationException("예약 정보를 잠시 후 다시 확인해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return member;
    }
}
