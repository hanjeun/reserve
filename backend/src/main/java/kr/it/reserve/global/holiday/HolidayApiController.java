package kr.it.reserve.global.holiday;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

/** 공휴일 표시는 예약 가능 판정과 별개다. 외부 호출·캐시가 임의로 늘지 않도록 조회할 달 범위를 제한한다. */
@RestController
@RequestMapping("/api/holidays")
@RequiredArgsConstructor
public class HolidayApiController {

    private static final int MONTHS_BEFORE = 12;
    private static final int MONTHS_AFTER = 36;

    private final HolidayService holidayService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<String>>> getMonthHolidays(@RequestParam String month) {
        YearMonth target;
        try {
            target = YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new BusinessException("month 는 YYYY-MM 형식이어야 해요.", HttpStatus.BAD_REQUEST);
        }

        YearMonth current = YearMonth.from(ServiceTime.today());
        if (target.isBefore(current.minusMonths(MONTHS_BEFORE)) || target.isAfter(current.plusMonths(MONTHS_AFTER))) {
            return ResponseEntity.ok(ApiResponse.success(List.of(), "공휴일 조회 범위 밖"));
        }

        List<String> dates = holidayService.holidaysOf(target).stream()
                .sorted()
                .map(LocalDate::toString)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(dates, "공휴일 조회 성공"));
    }
}
