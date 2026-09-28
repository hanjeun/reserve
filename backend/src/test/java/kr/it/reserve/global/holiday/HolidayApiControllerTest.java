package kr.it.reserve.global.holiday;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 가게 등록 폼 달력용 공휴일 목록 — 날짜 문자열 정렬, 형식 오류 400, 조회 범위 밖은 외부 호출 없이 빈 목록.
 */
@ExtendWith(MockitoExtension.class)
class HolidayApiControllerTest {

    @Mock private HolidayService holidayService;
    @InjectMocks private HolidayApiController controller;

    @Test
    @DisplayName("해당 달의 공휴일을 날짜순 YYYY-MM-DD 로 준다")
    void returnsSortedDates() {
        YearMonth month = YearMonth.from(ServiceTime.today()).plusMonths(2);
        LocalDate later = month.atDay(25);
        LocalDate earlier = month.atDay(3);
        when(holidayService.holidaysOf(month)).thenReturn(Set.of(later, earlier));

        var body = controller.getMonthHolidays(month.toString()).getBody();

        assertThat(body).isNotNull();
        assertThat(body.getData()).containsExactly(earlier.toString(), later.toString());
    }

    @Test
    @DisplayName("형식이 틀린 month 는 400")
    void rejectsMalformedMonth() {
        assertThatThrownBy(() -> controller.getMonthHolidays("2026-13"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getStatus())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        verify(holidayService, never()).holidaysOf(any());
    }

    @Test
    @DisplayName("조회 범위(과거 12개월~미래 36개월) 밖은 외부 호출 없이 빈 목록")
    void outOfRangeReturnsEmptyWithoutLookup() {
        YearMonth current = YearMonth.from(ServiceTime.today());

        assertThat(controller.getMonthHolidays(current.plusMonths(37).toString()).getBody().getData()).isEmpty();
        assertThat(controller.getMonthHolidays(current.minusMonths(13).toString()).getBody().getData()).isEmpty();
        verify(holidayService, never()).holidaysOf(any());
    }
}
