package kr.it.reserve.search;

import kr.it.reserve.global.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.*;

class SearchFilterTest {
    @Test void validatesScopedTermsAndConvertsKoreanDatesToUtcBounds() {
        var filter = SearchFilter.parse("messages", "", "2026-10-26", "");
        var query = SearchQuery.from("내 메시지 오늘", 5, filter);
        assertThat(query.keyword()).isEqualTo("내 메시지 오늘"); assertThat(query.term()).isEmpty();
        assertThat(query.dayStart()).hasToString("2026-10-25T15:00");
        assertThat(query.dayEnd()).hasToString("2026-10-26T15:00");
        assertThat(query.includes("messages")).isTrue(); assertThat(query.includes("stores")).isFalse();
    }
    @Test void canonicalizesKnownRegionsWithoutTurningThemIntoSqlOrAuthority() {
        assertThat(SearchFilter.parse("stores", "공방", "", "서울특별시 강남구").region()).isEqualTo("서울 강남구");
        assertThatThrownBy(() -> SearchFilter.parse("stores", "공방", "", "서울 강남구 OR 1=1")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SearchFilter.parse("reservations", "공방", "", "서울")).isInstanceOf(BusinessException.class);
        assertThat(SearchFilter.parse("all", null, "", "")).isNull();
    }
    @ParameterizedTest @ValueSource(strings = {"admin", "other-member", "ALL", "stores, reservations", "messages OR 1=1"})
    void rejectsUnrecognizedScopes(String scope) { assertThatThrownBy(() -> SearchFilter.parse(scope, "", "", "")).isInstanceOf(BusinessException.class); }
    @ParameterizedTest @ValueSource(strings = {"2026-02-30", "tomorrow", "2026-10-26T00:00:00", "0000-01-01"})
    void rejectsInvalidDates(String date) { assertThatThrownBy(() -> SearchFilter.parse("reservations", "", date, "")).isInstanceOf(BusinessException.class); }
    @Test void rejectsHiddenControlCharactersAndUnscopedDateQueries() {
        assertThatThrownBy(() -> SearchFilter.parse("stores", "x".repeat(101), "", "")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SearchFilter.parse("stores", "line\ntext", "", "")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SearchFilter.parse("stores", "공방", "2026-10-26", "")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SearchFilter.parse("all", "", "", "")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SearchFilter.parse("messages", "", "9999-12-31", "")).isInstanceOf(BusinessException.class);
        assertThat(SearchQuery.from("도예", 5).related()).hasSize(1);
        assertThat(SearchQuery.from("%' OR 1=1 --", 5).related()).isEmpty();
    }
}
