package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 달력(월 단위) 조회 — <b>막힌 이유가 사유별로 구분돼 내려오는가.</b>
 *
 * <h2>왜 이 테스트가 필요한가</h2>
 * 이 API 의 존재 이유 자체가 "회색 하나로 뭉개지 않는 것"이다. 사유가 뭉개지거나
 * 서버 {@code isBookableOn} 과 순서가 어긋나면 <b>달력엔 눌리는데 예약하면 거절</b>이 돌아온다.
 * 이 프로젝트가 반복해서 당한 형태라 계약으로 못 박는다.
 *
 * <p>날짜는 전부 <b>상대값</b>이다. 고정 날짜 픽스처는 시간이 지나면 과거가 돼서 조용히 썩는다
 * ({@code ReservationAvailabilityTest} 가 실제로 그렇게 썩어 있었다).
 */
@ExtendWith(MockitoExtension.class)
class ReservationCalendarTest {

    @Mock private ReservationRepository reservationRepository;
    @Mock private StoreRepository storeRepository;
    @Mock private PaymentService paymentService;
    @Mock private EmailService emailService;
    @Mock private MemberRepository memberRepository;
    @Mock private AuditLogService auditLogService;
    /** 빨간날 색칠용. 기본 mock 이 빈 Set 을 주므로 공휴일 없음 = 기존 기대값 그대로다. */
    @Mock private HolidayService holidayService;

    @InjectMocks
    private ReservationService reservationService;

    /** 이번 달 안에서 검사하면 "오늘 이전"이 섞여 판정이 흐려진다. 다음 달을 본다. */
    private static final YearMonth NEXT_MONTH = YearMonth.from(ServiceTime.today()).plusMonths(1);

    private Store openStore() {
        Store store = Store.builder()
                .openTime(LocalTime.of(9, 0))
                .closeTime(LocalTime.of(11, 0))
                .reservationSlotMinutes(60)     // 09:00, 10:00 두 칸
                .maxCapacityPerSlot(null)       // 무제한
                .build();
        store.setId(1L);
        return store;
    }

    private Map<String, CalendarDayResponse> calendar(Store store) {
        when(storeRepository.findById(anyLong())).thenReturn(Optional.of(store));
        lenient().when(reservationRepository.sumActiveGuestsGroupedByDateAndTime(
                        anyLong(), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.of());
        return reservationService.getMonthCalendar(1L, NEXT_MONTH).stream()
                .collect(Collectors.toMap(CalendarDayResponse::getDate, Function.identity()));
    }

    private static String ymd(LocalDate d) {
        return d.toString();
    }

    @Test
    @DisplayName("공휴일이 그대로 실려 내려온다 — 프론트가 날짜를 보고 다시 판정하지 않게")
    void holidayFlagIsCarried() {
        LocalDate holiday = NEXT_MONTH.atDay(5);
        when(holidayService.holidaysOf(NEXT_MONTH)).thenReturn(Set.of(holiday));

        Map<String, CalendarDayResponse> days = calendar(openStore());

        assertThat(days.get(ymd(holiday)).isHoliday()).isTrue();
        assertThat(days.get(ymd(NEXT_MONTH.atDay(6))).isHoliday()).isFalse();
    }

    @Test
    @DisplayName("★ 공휴일이어도 예약은 열려 있다 — 빨간날은 색칠일 뿐 판정이 아니다")
    void holidayDoesNotBlockBooking() {
        LocalDate holiday = NEXT_MONTH.atDay(5);
        when(holidayService.holidaysOf(NEXT_MONTH)).thenReturn(Set.of(holiday));

        CalendarDayResponse day = calendar(openStore()).get(ymd(holiday));

        assertThat(day.getStatus()).isEqualTo("OPEN");
        assertThat(day.getOpenSlots()).isEqualTo(2);
    }

    @Test
    @DisplayName("★ 공휴일 조회가 죽어도 달력은 그대로 뜬다 — 전부 false 로 내려올 뿐")
    void holidayLookupFailureIsInvisible() {
        // HolidayService 는 실패해도 예외 대신 빈 집합을 준다(HolidayServiceTest 계약).
        when(holidayService.holidaysOf(NEXT_MONTH)).thenReturn(Set.of());

        Map<String, CalendarDayResponse> days = calendar(openStore());

        assertThat(days).hasSize(NEXT_MONTH.lengthOfMonth());
        assertThat(days.values()).noneMatch(CalendarDayResponse::isHoliday);
        assertThat(days.get(ymd(NEXT_MONTH.atDay(15))).getStatus()).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("한 달치가 하루도 빠짐없이 내려온다 — 빈 칸이 생기면 달력이 그릴 수 없다")
    void coversEveryDayOfMonth() {
        Map<String, CalendarDayResponse> days = calendar(openStore());

        assertThat(days).hasSize(NEXT_MONTH.lengthOfMonth());
        assertThat(days).containsKey(ymd(NEXT_MONTH.atDay(1)));
        assertThat(days).containsKey(ymd(NEXT_MONTH.atEndOfMonth()));
    }

    @Test
    @DisplayName("평범한 날은 OPEN 이고 고를 수 있는 시각 수가 함께 온다")
    void plainDayIsOpenWithSlotCount() {
        CalendarDayResponse day = calendar(openStore()).get(ymd(NEXT_MONTH.atDay(15)));

        assertThat(day.getStatus()).isEqualTo("OPEN");
        assertThat(day.getTotalSlots()).isEqualTo(2);
        assertThat(day.getOpenSlots()).isEqualTo(2);
    }

    @Test
    @DisplayName("★ 휴무와 운영기간 밖이 서로 다른 사유로 구분된다 — 이게 이 API 의 존재 이유다")
    void closedAndOutOfPeriodAreDifferentReasons() {
        LocalDate closed = NEXT_MONTH.atDay(10);
        Store store = openStore();
        store.setClosedDates(closed.toString());
        // 이 달 20일까지만 운영 → 21일부터는 기간 밖
        store.setCloseDate(NEXT_MONTH.atDay(20));

        Map<String, CalendarDayResponse> days = calendar(store);

        assertThat(days.get(ymd(closed)).getStatus()).isEqualTo("CLOSED");
        assertThat(days.get(ymd(NEXT_MONTH.atDay(21))).getStatus()).isEqualTo("OUT_OF_PERIOD");
        assertThat(days.get(ymd(NEXT_MONTH.atDay(11))).getStatus()).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("휴무가 운영기간 밖보다 앞선다 — 예약 실패 메시지의 분기 순서와 같아야 한다")
    void closedWinsOverOutOfPeriod() {
        LocalDate both = NEXT_MONTH.atDay(25);
        Store store = openStore();
        store.setClosedDates(both.toString());
        store.setCloseDate(NEXT_MONTH.atDay(20));   // 25일은 기간 밖이기도 하다

        assertThat(calendar(store).get(ymd(both)).getStatus()).isEqualTo("CLOSED");
    }

    @Test
    @DisplayName("예약 가능 범위(maxAdvanceBookingDays)를 넘으면 TOO_FAR")
    void beyondAdvanceWindowIsTooFar() {
        Store store = openStore();
        // 오늘부터 1일까지만 → 다음 달은 전부 범위 밖이다.
        store.setMaxAdvanceBookingDays(1);

        assertThat(calendar(store).get(ymd(NEXT_MONTH.atDay(15))).getStatus()).isEqualTo("TOO_FAR");
    }

    @Test
    @DisplayName("null/0 인 maxAdvanceBookingDays 는 '제한 없음'이다 — 기존 가게가 전부 막히면 안 된다")
    void noAdvanceLimitMeansUnlimited() {
        Store store = openStore();
        assertThat(store.getMaxAdvanceBookingDays()).isNull();
        assertThat(calendar(store).get(ymd(NEXT_MONTH.atDay(15))).getStatus()).isEqualTo("OPEN");

        store.setMaxAdvanceBookingDays(0);
        assertThat(calendar(store).get(ymd(NEXT_MONTH.atDay(15))).getStatus()).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("★ 정원이 다 차면 FULL — 열려 있는데 고를 게 없는 상태를 휴무와 구분한다")
    void allSlotsTakenIsFull() {
        LocalDate full = NEXT_MONTH.atDay(12);
        Store store = openStore();
        store.setMaxCapacityPerSlot(4);

        when(storeRepository.findById(anyLong())).thenReturn(Optional.of(store));
        when(reservationRepository.sumActiveGuestsGroupedByDateAndTime(
                anyLong(), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.<Object[]>of(
                        new Object[]{full, LocalTime.of(9, 0), 4L},
                        new Object[]{full, LocalTime.of(10, 0), 5L}   // 초과분도 마감이다
                ));

        Map<String, CalendarDayResponse> days = reservationService.getMonthCalendar(1L, NEXT_MONTH).stream()
                .collect(Collectors.toMap(CalendarDayResponse::getDate, Function.identity()));

        CalendarDayResponse day = days.get(ymd(full));
        assertThat(day.getStatus()).isEqualTo("FULL");
        assertThat(day.getTotalSlots()).isEqualTo(2);   // 구조적으로는 두 칸이 있다
        assertThat(day.getOpenSlots()).isZero();

        // 옆 날짜는 멀쩡해야 한다 — 하루의 마감이 달 전체로 번지면 안 된다.
        assertThat(days.get(ymd(NEXT_MONTH.atDay(13))).getStatus()).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("한 칸만 차면 여전히 OPEN 이고 남은 수가 줄어든다")
    void partiallyTakenStaysOpen() {
        LocalDate partial = NEXT_MONTH.atDay(14);
        Store store = openStore();
        store.setMaxCapacityPerSlot(4);

        when(storeRepository.findById(anyLong())).thenReturn(Optional.of(store));
        when(reservationRepository.sumActiveGuestsGroupedByDateAndTime(
                anyLong(), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.<Object[]>of(new Object[]{partial, LocalTime.of(9, 0), 4L}));

        CalendarDayResponse day = reservationService.getMonthCalendar(1L, NEXT_MONTH).stream()
                .filter(d -> d.getDate().equals(ymd(partial)))
                .findFirst().orElseThrow();

        assertThat(day.getStatus()).isEqualTo("OPEN");
        assertThat(day.getOpenSlots()).isEqualTo(1);
    }

    @Test
    @DisplayName("DAY 방식은 하루에 한 칸 — 그 한 칸이 차면 곧바로 FULL 이다")
    void dayBookingHasSingleSlot() {
        Store store = openStore();
        store.setBookingType(Store.BookingType.DAY);

        assertThat(calendar(store).get(ymd(NEXT_MONTH.atDay(15))).getTotalSlots()).isEqualTo(1);
    }

    @Test
    @DisplayName("지난 달은 전부 PAST — 사유가 뭉개지지 않는지 확인한다")
    void pastMonthIsAllPast() {
        Store store = openStore();
        when(storeRepository.findById(anyLong())).thenReturn(Optional.of(store));
        lenient().when(reservationRepository.sumActiveGuestsGroupedByDateAndTime(
                        anyLong(), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.of());

        YearMonth lastMonth = YearMonth.from(ServiceTime.today()).minusMonths(1);

        assertThat(reservationService.getMonthCalendar(1L, lastMonth))
                .isNotEmpty()
                .allMatch(d -> "PAST".equals(d.getStatus()));
    }
}
