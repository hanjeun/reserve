package kr.it.reserve.global.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordPolicyTest {

    @Test
    void acceptsTheSharedLetterAndDigitPolicy() {
        assertThat(PasswordPolicy.violation("Reserve2026!")).isNull();
    }

    @Test
    void rejectsShortCompositionAndBcryptByteOverflow() {
        assertThat(PasswordPolicy.violation("Short1")).isEqualTo(PasswordPolicy.LENGTH_MESSAGE);
        assertThat(PasswordPolicy.violation("onlyletters")).isEqualTo(PasswordPolicy.COMPOSITION_MESSAGE);
        assertThat(PasswordPolicy.violation("가".repeat(30) + "A1"))
                .isEqualTo(PasswordPolicy.BYTE_LENGTH_MESSAGE);
    }
}
