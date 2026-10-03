package kr.it.reserve.global.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class PwnedPasswordCheckerTest {

    private static final String SUFFIX = "A".repeat(35);
    private final PwnedPasswordChecker checker = new PwnedPasswordChecker();

    @BeforeEach
    void configureThreshold() {
        ReflectionTestUtils.setField(checker, "threshold", 5);
    }

    @Test
    void ignoresMalformedAndUnrelatedLinesBeforeMatchingSuffix() {
        String body = "header without separator\n:100\nABC:100\n"
                + "B".repeat(35) + ":100\n" + SUFFIX + ":5\r\n";
        assertThat(containsListedSuffix(body)).isTrue();
    }

    @Test
    void comparesCountsAndAcceptsCaseInsensitiveSuffixes() {
        assertThat(containsListedSuffix(SUFFIX.toLowerCase(Locale.ROOT) + ":5")).isTrue();
        assertThat(containsListedSuffix(SUFFIX + ":4")).isFalse();
        assertThat(containsListedSuffix(SUFFIX + ":0")).isFalse();
    }

    @Test
    void rejectsListedSuffixEvenWhenItsCountIsMalformed() {
        assertThat(containsListedSuffix(SUFFIX + ":not-a-count")).isTrue();
        assertThat(containsListedSuffix(SUFFIX + ":999999999999999999999")).isTrue();
        assertThat(containsListedSuffix("B".repeat(35) + ":not-a-count")).isFalse();
    }

    private boolean containsListedSuffix(String body) {
        return Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(
                checker, "containsSuffixOverThreshold", body, SUFFIX));
    }
}
