package kr.it.reserve.search;

import kr.it.reserve.global.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class SearchQueryTest {
    @Test void normalizesWhitespaceAndEscapesSqlWildcardsAsLiteralText() {
        var query = SearchQuery.from("  100%_!  ", 5);
        assertThat(query.keyword()).isEqualTo("100%_!");
        assertThat(query.pattern()).isEqualTo("%100!%!_!!%");
        assertThat(SearchQuery.from(null, 1).keyword()).isEmpty();
    }
    @ParameterizedTest @ValueSource(ints = {-1, 0, 6, Integer.MAX_VALUE})
    void resultCountCannotExpandTheDatabaseWork(int limit) {
        assertThatThrownBy(() -> SearchQuery.from("예약", limit)).isInstanceOf(BusinessException.class);
    }
    @ParameterizedTest @ValueSource(strings = {"line\nbreak", "tab\tvalue", "nul\u0000value"})
    void rejectsControlCharacters(String value) {
        assertThatThrownBy(() -> SearchQuery.from(value, 5)).isInstanceOf(BusinessException.class);
    }
    @Test void enforcesTheLengthBeforeAnySourceQuery() {
        assertThatThrownBy(() -> SearchQuery.from("x".repeat(101), 5)).isInstanceOf(BusinessException.class);
        assertThat(SearchQuery.from("x".repeat(100), 5).keyword()).hasSize(100);
    }
    @Test void snippetsStayBoundedWithoutSplittingUnicodeCodePoints() {
        assertThat(SearchQuery.text("  a\nb\t c ", 10)).isEqualTo("a b c");
        String result = SearchQuery.text("😀".repeat(200), 160);
        assertThat(result.codePointCount(0, result.length())).isEqualTo(160);
        assertThat(result).doesNotContain("\n", "\t");
    }
}
