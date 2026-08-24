package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
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
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * getAvailability 슬롯 경계 로직 검증.
 *
 * 핵심: close("영업 종료 시각")는 마지막 예약 슬롯이 아니다.
 * 예약이 슬롯 단위(reservationSlotMinutes)만큼 자리를 점유한다고 보고,
 * "마지막 슬롯 + slotMin > close" 인 슬롯은 제외해야 한다.
 * (예: 09:00~21:00, 30분 단위 → 마지막 예약 슬롯은 20:30, 21:00 슬롯은 나오면 안 됨)
 *
 * 이 회귀 테스트는 close 정각 슬롯 버그(2026-07 수정)가 되살아나는 것을 막는다.
 */
@ExtendWith(MockitoExtension.class)
class ReservationAvailabilityTest {

    @Mock
    private ReservationRepository reservationRepository;

    @Mock
    private StoreRepository storeRepository;

    @Mock
    private PaymentService paymentService;

    @Mock
    private EmailService emailService;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private ReservationService reservationService;

    private Store storeWithHours(LocalTime open, LocalTime close, int slotMinutes) {
        Store store = Store.builder()
                .openTime(open)
                .closeTime(close)
                .reservationSlotMinutes(slotMinutes)
                .maxCapacityPerSlot(null) // 무제한 — 모든 슬롯 available=true
                .build();
        store.setId(1L);
        return store;
    }

    private List<String> availableTimes(Store store) {
        when(storeRepository.findById(anyLong())).thenReturn(Optional.of(store));
        lenient().when(reservationRepository.sumActiveGuestsGroupedByTime(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of()); // 예약 없음
        return reservationService.getAvailability(1L, LocalDate.of(2026, 7, 10))
                .stream().map(SlotAvailabilityResponse::getTime).toList();
    }

    @Test
    void lastSlotDoesNotIncludeClosingTime_30min() {
        // 09:00 ~ 21:00, 30분 단위 → 마지막 슬롯 20:30, 21:00은 제외
        List<String> times = availableTimes(storeWithHours(LocalTime.of(9, 0), LocalTime.of(21, 0), 30));

        assertThat(times).contains("09:00", "20:30");
        assertThat(times).doesNotContain("21:00");
        assertThat(times.get(times.size() - 1)).isEqualTo("20:30");
    }

    @Test
    void lastSlotDoesNotIncludeClosingTime_60min() {
        // 10:00 ~ 18:00, 60분 단위 → 마지막 슬롯 17:00, 18:00은 제외
        List<String> times = availableTimes(storeWithHours(LocalTime.of(10, 0), LocalTime.of(18, 0), 60));

        assertThat(times).contains("10:00", "17:00");
        assertThat(times).doesNotContain("18:00");
    }

    @Test
    void slotThatWouldEndAfterCloseIsExcluded() {
        // 09:00 ~ 09:45, 30분 단위 → 09:00(끝 09:30, OK), 09:30 슬롯은 끝이 10:00이라 close(09:45) 초과 → 제외
        List<String> times = availableTimes(storeWithHours(LocalTime.of(9, 0), LocalTime.of(9, 45), 30));

        assertThat(times).containsExactly("09:00");
    }

    // ── 예약 방식 (2026-08-24) ─────────────────────────────────────────────
    //
    // 세 방식이 **같은 관문**(bookableSlotTimes)을 지나므로, 여기서 방식별 결과만 고정하면
    // 예약 생성 검증(validateReservationSlot)도 같은 답을 내는 것이 보장된다 —
    // 그쪽이 이 목록의 "포함 여부"만 보기 때문이다.

    @Test
    @DisplayName("★ bookingType 이 null 이면 SLOT 으로 동작한다 — ddl-auto 로 컬럼만 추가된 기존 가게")
    void nullBookingTypeBehavesAsSlot() {
        // 이 케이스가 깨지면 기존 가게 전부가 예약 불가가 된다.
        Store store = storeWithHours(LocalTime.of(9, 0), LocalTime.of(11, 0), 60);
        assertThat(store.getBookingType()).isNull();

        assertThat(availableTimes(store)).containsExactly("09:00", "10:00");
    }

    @Test
    @DisplayName("SESSION — 사장님이 나열한 회차만 나온다. 영업시간·브레이크타임을 얹지 않는다")
    void sessionUsesListedTimesOnly() {
        // 영업시간은 09:00~11:00 인데 회차는 그 밖(14:00)까지 있다.
        // 회차를 직접 적었다는 건 그 시각에 받겠다는 뜻이므로 그대로 나와야 한다 —
        // 여기에 영업시간을 얹으면 "적었는데 안 보이는" 상태가 된다.
        Store store = storeWithHours(LocalTime.of(9, 0), LocalTime.of(11, 0), 60);
        store.setBookingType(Store.BookingType.SESSION);
        store.setSessionTimeList(List.of(LocalTime.of(14, 0), LocalTime.of(11, 0)));

        assertThat(availableTimes(store)).containsExactly("11:00", "14:00"); // 정렬됨
    }

    @Test
    @DisplayName("DAY — 하루에 슬롯이 딱 하나. 그 시각은 영업 시작 시각이다")
    void dayHasExactlyOneSlot() {
        Store store = storeWithHours(LocalTime.of(9, 0), LocalTime.of(21, 0), 30);
        store.setBookingType(Store.BookingType.DAY);

        // 시간을 nullable 로 만들지 않고 "하루 = 슬롯 한 개"로 모델링한 결과 —
        // 정원·중복·마감·결제가 전부 그대로 재사용된다.
        assertThat(availableTimes(store)).containsExactly("09:00");
    }

    @Test
    @DisplayName("DAY — 영업시간이 없어도 슬롯 하나는 나온다 (자정)")
    void dayWorksWithoutBusinessHours() {
        Store store = Store.builder().build();
        store.setId(1L);
        store.setBookingType(Store.BookingType.DAY);

        assertThat(availableTimes(store)).containsExactly("00:00");
    }

    @Test
    @DisplayName("운영 기간 밖이면 방식과 무관하게 슬롯이 0개다")
    void outsideOperatingPeriodYieldsNothing() {
        Store store = storeWithHours(LocalTime.of(9, 0), LocalTime.of(21, 0), 30);
        // availableTimes 는 2026-07-10 을 조회한다. 그 뒤로 기간을 잡으면 밖이다.
        store.setOpenDate(LocalDate.of(2026, 8, 1));

        assertThat(availableTimes(store)).isEmpty();
    }
}
