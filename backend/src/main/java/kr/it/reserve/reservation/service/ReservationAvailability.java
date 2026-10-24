package kr.it.reserve.reservation.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Availability reads and the write validator share one structural slot policy. The facade owns transactions. */
@Slf4j(topic = "kr.it.reserve.reservation.service.ReservationService")
final class ReservationAvailability {
    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final HolidayService holidayService;
    private static final String STORE_NOT_FOUND_MESSAGE = "가게를 찾을 수 없어요.";
    ReservationAvailability(ReservationRepository reservations, StoreRepository stores, HolidayService holidays) { reservationRepository=reservations; storeRepository=stores; holidayService=holidays; }

    public List<SlotAvailabilityResponse> getAvailability(Long storeId, LocalDate date) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));

        Map<LocalTime, Long> guestSumByTime = reservationRepository
                .sumActiveGuestsGroupedByTime(storeId, date).stream()
                .collect(Collectors.toMap(
                        row -> (LocalTime) row[0],
                        row -> ((Number) row[1]).longValue()
                ));
        Integer capacity = store.getMaxCapacityPerSlot();

        return bookableSlotTimesNow(store, date).stream()
                .map(t -> {
                    long booked = guestSumByTime.getOrDefault(t, 0L);
                    boolean available = capacity == null || capacity <= 0 || booked < capacity;
                    return new SlotAvailabilityResponse(t.toString().substring(0, 5), available);
                })
                .toList();
    }

    /**
     * <b>그 가게가 그 날 받을 수 있는 예약 시각 목록.</b> 예약 방식별 분기는 여기 한 곳뿐이다.
     *
     * <p>★ 이 메서드가 이 클래스에서 가장 중요한 관문이다. 예전에는 같은 판정이 두 벌 있었다 —
     * {@code getAvailability} 는 슬롯을 <b>생성</b>했고, {@code validateReservationSlot} 은
     * 범위를 <b>비교</b>했다. 두 코드가 다른 모양이라 실제로 어긋나 있었다:
     * 30분 단위 가게에 {@code 09:07} 을 API 로 직접 보내면 범위 검사는 통과했다(슬롯 목록엔 없는데도).
     * 목록을 만들어 <b>포함 여부로 검사</b>하면 그 틈이 원천적으로 사라지고,
     * 예약 방식이 셋으로 늘어도 분기가 한 곳에만 생긴다.
     *
     * <p>비어 있는 목록 = 그 날은 예약을 받지 않는다. 화면은 "예약 가능한 시간이 없습니다"를
     * 그대로 보여주므로 호출측에 별도 분기가 필요 없다.
     */
    List<LocalTime> bookableSlotTimes(Store store, LocalDate date) {
        // 휴무일·운영기간 밖 (2026-08-11, 2026-08-24). 판정은 Store 한 곳에 있다.
        if (!store.isBookableOn(date)) return List.of();

        return switch (store.resolveBookingType()) {
            // 사장님이 나열한 회차 그대로. 영업시간·브레이크타임을 적용하지 않는다 —
            // 회차를 직접 적었다는 건 그 시각에 받겠다는 뜻이고, 그 위에 다른 규칙을 얹으면
            // "적었는데 안 보이는" 상태가 된다.
            case SESSION -> store.getSessionTimeList();

            // 하루 = 슬롯 한 개. 정원·중복·마감·결제가 전부 그대로 재사용된다.
            case DAY -> List.of(store.dayBookingTime());

            case SLOT -> slotGrid(store);
        };
    }

    /**
     * 가게의 구조적 시간 목록에서 지난 시각·예약 범위 밖·마감된 시각을 제외한다.
     * 구조적 목록은 가게가 제공하는 시간을, 이 목록은 현재 선택할 수 있는 시간을 나타낸다.
     * 제출 검증은 실패 사유를 구분하도록 구조적 목록과 현재 시각·마감을 각각 검사한다.
     */
    private List<LocalTime> bookableSlotTimesNow(Store store, LocalDate date) {
        LocalDateTime now = ServiceTime.now();
        Integer deadlineHours = store.getBookingDeadlineHours();
        Integer maxAdvance = store.getMaxAdvanceBookingDays();
        if (date != null && maxAdvance != null && maxAdvance > 0
                && date.isAfter(now.toLocalDate().plusDays(maxAdvance))) {
            return List.of();
        }

        return bookableSlotTimes(store, date).stream()
                .filter(t -> {
                    LocalDateTime slotAt = LocalDateTime.of(date, t);
                    if (!slotAt.isAfter(now)) return false;
                    if (deadlineHours == null || deadlineHours <= 0) return true;
                    return !now.isAfter(slotAt.minusHours(deadlineHours));
                })
                .toList();
    }

    /**
     * 달력(월 단위) — 날짜마다 <b>상태와 그 사유</b>를 내려준다.
     *
     * <p>이 API 가 생긴 이유는 {@link CalendarDayResponse} 주석에 있다. 요약하면,
     * {@code disabledDate} 는 회색으로 막는 것밖에 못 해서 휴무·기간밖·마감이 전부 한 색이 된다.
     *
     * <p><b>★ 판정 순서를 {@code validateReservationSlot} 과 맞춘다.</b>
     * 지난날 → 휴무 → 운영기간 → 예약범위 → 정원. 순서가 다르면 달력이 말하는 이유와
     * 예약 실패 메시지가 서로 다른 말을 하게 된다(둘 다 맞는 말이라도 사용자는 혼란스럽다).
     *
     * <p>쿼리는 <b>한 번</b>이다. 날짜마다 조회하면 달을 넘길 때마다 31 쿼리가 나간다.
     */
    public List<CalendarDayResponse> getMonthCalendar(Long storeId, YearMonth month) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException(STORE_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));

        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();

        // [날짜][시각] -> 이미 잡힌 인원
        Map<LocalDate, Map<LocalTime, Long>> bookedByDate = new HashMap<>();
        for (Object[] row : reservationRepository.sumActiveGuestsGroupedByDateAndTime(storeId, from, to)) {
            bookedByDate
                    .computeIfAbsent((LocalDate) row[0], d -> new HashMap<>())
                    .put((LocalTime) row[1], ((Number) row[2]).longValue());
        }

        Integer capacity = store.getMaxCapacityPerSlot();

        LocalDate today = ServiceTime.today();
        Integer maxAdvance = store.getMaxAdvanceBookingDays();
        // null 또는 0 = 제한 없음. 기존 가게의 동작을 그대로 둔다(validateReservationSlot 과 같은 규칙).
        LocalDate lastBookable = (maxAdvance != null && maxAdvance > 0) ? today.plusDays(maxAdvance) : null;

        // 빨간날. 키가 없거나 포털이 죽어 있으면 빈 집합이 오고, 달력은 그대로 뜬다.
        Set<LocalDate> holidays = holidayService.holidaysOf(month);

        List<CalendarDayResponse> days = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            days.add(describeDay(store, date, today, lastBookable, capacity,
                    bookedByDate.getOrDefault(date, Map.of()), holidays.contains(date)));
        }
        return days;
    }

    /** 달력 한 칸. 순서가 곧 사유의 우선순위다 — {@link #getMonthCalendar} 주석 참고. */
    private CalendarDayResponse describeDay(Store store, LocalDate date, LocalDate today,
                                            LocalDate lastBookable, Integer capacity,
                                            Map<LocalTime, Long> booked, boolean holiday) {
        String ymd = date.toString();

        if (date.isBefore(today)) {
            return new CalendarDayResponse(ymd, CalendarDayResponse.DayStatus.PAST.name(), 0, 0, holiday);
        }
        // 휴무를 운영기간보다 먼저 본다 — validateReservationSlot 의 문구 분기와 같은 순서다.
        if (store.isClosedOn(date)) {
            return new CalendarDayResponse(ymd, CalendarDayResponse.DayStatus.CLOSED.name(), 0, 0, holiday);
        }
        if (!store.isBookableOn(date)) {
            return new CalendarDayResponse(ymd, CalendarDayResponse.DayStatus.OUT_OF_PERIOD.name(), 0, 0, holiday);
        }
        if (lastBookable != null && date.isAfter(lastBookable)) {
            return new CalendarDayResponse(ymd, CalendarDayResponse.DayStatus.TOO_FAR.name(), 0, 0, holiday);
        }

        boolean capped = capacity != null && capacity > 0;
        int total = bookableSlotTimes(store, date).size();
        long open = bookableSlotTimesNow(store, date).stream()
                .filter(t -> !capped || booked.getOrDefault(t, 0L) < capacity)
                .count();

        // total 이 0 이면 영업시간이 비었거나 회차를 안 적은 가게다. 막힌 것은 맞지만
        // 휴무도 기간밖도 아니므로 FULL 로 표현한다 — 화면에서는 둘 다 "예약 불가"다.
        String status = open > 0
                ? CalendarDayResponse.DayStatus.OPEN.name()
                : CalendarDayResponse.DayStatus.FULL.name();
        return new CalendarDayResponse(ymd, status, total, (int) open, holiday);
    }

    /** SLOT 방식의 시각 격자 — 영업시간을 예약 단위로 쪼개고 브레이크타임을 뺀다. */
    private List<LocalTime> slotGrid(Store store) {
        if (store.getOpenTime() == null || store.getCloseTime() == null) return List.of();

        int slotMin = store.getReservationSlotMinutes() != null ? store.getReservationSlotMinutes() : 30;
        // slotMin 이 0 이면 cursor 가 전진하지 않아 **무한루프 + OOM** 이 된다.
        //   저장 시 clampSlotMinutes 가 막지만, 그 전에 저장된 데이터나 수동 DB 변경이 있을 수 있어
        //   읽는 쪽에도 가드를 둔다. 이 경로는 로그인만 하면 누구나 호출할 수 있다.
        if (slotMin <= 0) {
            log.warn("Invalid reservationSlotMinutes: storeId={}, value={} - returning empty slots",
                    store.getId(), slotMin);
            return List.of();
        }

        LocalTime open  = store.getOpenTime();
        LocalTime close = store.getCloseTime();
        LocalTime breakStart = store.getBreakStartTime();
        LocalTime breakEnd   = store.getBreakEndTime();
        boolean hasBreak = breakStart != null && breakEnd != null;

        List<LocalTime> result = new ArrayList<>();
        LocalTime cursor = open;
        // close 는 "영업 종료 시각"이므로, 예약이 예약 단위만큼 자리를 점유한다고 보고
        // 마지막 슬롯 + slotMin 이 close 를 넘어가면 제외한다.
        // 예) 09:00~21:00 / 30분 → 마지막 슬롯 20:30. 21:00 은 21:30 이 되어 제외.
        // (close 가 자정을 넘어가는 가게는 지원하지 않는다 — StoreService 가 저장 단계에서 거절한다.)
        // LocalTime.plusMinutes 는 자정을 돌면 00시로 돌아오므로, 남은 당일 시간을 먼저 비교한다.
        while (Duration.between(cursor, close).toMinutes() >= slotMin) {
            boolean inBreak = hasBreak && !cursor.isBefore(breakStart) && cursor.isBefore(breakEnd);
            if (!inBreak) result.add(cursor);
            cursor = cursor.plusMinutes(slotMin);
        }
        return result;
    }
}
