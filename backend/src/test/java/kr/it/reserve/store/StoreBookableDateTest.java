package kr.it.reserve.store;

import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link Store#isBookableOn} — 그 날짜에 예약을 받을 수 있는가.
 *
 * <p><b>왜 이 테스트가 있나</b> — 이 판정은 <b>세 곳이 같은 답을 내야 한다</b>:
 * 예약 생성 검증, 가능시간 조회, 그리고 손님 화면의 달력.
 * 판정이 흩어지면 "달력엔 눌리는데 예약하면 거절당하는" 상태가 되고, 그건 사용자가
 * 원인을 짐작할 수 없는 종류의 고장이다. 그래서 메서드를 하나로 모았고,
 * 여기서 그 메서드의 계약을 고정한다.
 *
 * <p>Spring 컨텍스트를 띄우지 않는다 — 순수 날짜 계산이다.
 */
class StoreBookableDateTest {

    private static final LocalDate D_09_10 = LocalDate.of(2026, 9, 10); // 목요일
    private static final LocalDate D_09_01 = LocalDate.of(2026, 9, 1);
    private static final LocalDate D_09_30 = LocalDate.of(2026, 9, 30);

    private Store store() {
        return Store.builder().build();
    }

    @Nested
    @DisplayName("운영 기간이 없으면 (기존 가게)")
    class NoPeriod {

        @Test
        @DisplayName("★ 두 값이 모두 null 이면 언제든 예약 가능 — ddl-auto 로 컬럼만 추가된 기존 행이 이 상태다")
        void 무기한_영업() {
            // ddl-auto: update 는 컬럼을 추가할 뿐 기존 행을 채우지 않는다.
            // 기존 가게 전부가 여기 해당하므로, 이 케이스가 깨지면 서비스 전체가 예약 불가가 된다.
            assertThat(store().isBookableOn(D_09_10)).isTrue();
        }

        @Test
        @DisplayName("휴무 판정은 그대로 살아 있다")
        void 휴무는_여전히_막는다() {
            Store s = store();
            s.setClosedDayList(List.of(D_09_10.getDayOfWeek().getValue()));

            assertThat(s.isBookableOn(D_09_10)).isFalse();
            assertThat(s.isClosedOn(D_09_10)).isTrue();
        }
    }

    @Nested
    @DisplayName("운영 기간이 있으면")
    class WithPeriod {

        @Test
        @DisplayName("★ 경계는 양쪽 모두 포함 — 시작일과 종료일 당일은 여는 날이다")
        void 경계_포함() {
            Store s = store();
            s.setOpenDate(D_09_01);
            s.setCloseDate(D_09_30);

            assertThat(s.isBookableOn(D_09_01)).as("시작일 당일").isTrue();
            assertThat(s.isBookableOn(D_09_30)).as("종료일 당일").isTrue();
        }

        @Test
        @DisplayName("기간 밖은 막는다")
        void 기간_밖() {
            Store s = store();
            s.setOpenDate(D_09_01);
            s.setCloseDate(D_09_30);

            assertThat(s.isBookableOn(D_09_01.minusDays(1))).as("시작 하루 전").isFalse();
            assertThat(s.isBookableOn(D_09_30.plusDays(1))).as("종료 하루 뒤").isFalse();
        }

        @Test
        @DisplayName("한쪽만 있어도 유효하다 — '오늘부터 무기한' / '이 날까지'")
        void 한쪽만() {
            Store openOnly = store();
            openOnly.setOpenDate(D_09_01);
            assertThat(openOnly.isBookableOn(D_09_01.minusDays(1))).isFalse();
            assertThat(openOnly.isBookableOn(D_09_30.plusYears(1))).as("종료일이 없으면 무기한").isTrue();

            Store closeOnly = store();
            closeOnly.setCloseDate(D_09_30);
            assertThat(closeOnly.isBookableOn(D_09_01.minusYears(1))).as("시작일이 없으면 제한 없음").isTrue();
            assertThat(closeOnly.isBookableOn(D_09_30.plusDays(1))).isFalse();
        }

        @Test
        @DisplayName("기간 안이어도 휴무면 막는다 — 두 조건은 AND 다")
        void 기간_안의_휴무() {
            Store s = store();
            s.setOpenDate(D_09_01);
            s.setCloseDate(D_09_30);
            s.setClosedDateList(List.of(D_09_10));

            assertThat(s.isBookableOn(D_09_10)).isFalse();
        }
    }

    @Test
    @DisplayName("null 날짜는 예약 불가로 본다 — 호출측이 매번 방어하지 않게")
    void null_날짜() {
        assertThat(store().isBookableOn(null)).isFalse();
    }
}
