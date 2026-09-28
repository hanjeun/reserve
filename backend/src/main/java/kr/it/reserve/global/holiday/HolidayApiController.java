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

/**
 * 가게와 무관한 공휴일 목록 — 가게 등록·수정의 날짜 선택 달력(운영 기간·임시 휴무)이 빨간날을 칠하는 용도.
 *
 * <p>예약 달력은 {@code /api/reservations/calendar} 가 가게 판정과 함께 {@code holiday} 를 내려주지만,
 * 가게를 만들기 전에는 storeId 가 없어서 그 API 를 쓸 수 없었다. 그래서 등록 폼 달력은 일요일만 빨갛게
 * 나왔다(크리스마스·설날이 평일처럼 보임). 판정은 여전히 하지 않는다 — {@link HolidayService} 주석처럼 색칠 전용이다.
 *
 * <p>조회 가능한 달을 오늘 기준 앞뒤로 제한한다. {@link HolidayService} 는 달마다 외부 API 를 한 번 부르고
 * 결과를 하루 동안 캐시하므로, 제한이 없으면 임의의 달을 연속으로 요청해 외부 호출과 캐시를 늘릴 수 있다.
 * 범위 밖은 오류 대신 빈 목록이다 — 달력에서 먼 해로 넘겨도 화면이 깨지지 않고 일요일만 빨갛게 나온다.
 */
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
            throw new BusinessException("month 는 YYYY-MM 형식이어야 합니다.", HttpStatus.BAD_REQUEST);
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
