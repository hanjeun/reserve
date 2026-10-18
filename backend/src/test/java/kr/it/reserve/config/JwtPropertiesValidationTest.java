package kr.it.reserve.config;

import kr.it.reserve.config.jwt.JwtProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtPropertiesValidationTest {
    private JwtProperties configured() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("test-issuer");
        properties.setSecretKey("test-only-jwt-signing-material-".repeat(3));
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(7);
        return properties;
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void rejectsMissingIssuer(String issuer) {
        JwtProperties properties = configured();
        properties.setIssuer(issuer);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("issuer");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    void rejectsNonpositiveAccessAndRefreshLifetimes(int lifetime) {
        JwtProperties access = configured();
        access.getAccessToken().setExpirationMinutes(lifetime);
        assertThatThrownBy(access::validate).isInstanceOf(IllegalStateException.class);
        JwtProperties refresh = configured();
        refresh.getRefreshToken().setExpirationDays(lifetime);
        assertThatThrownBy(refresh::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsMissingAndAmbiguousExpirationButKeepsExistingValidConfiguration() {
        assertThatCode(configured()::validate).doesNotThrowAnyException();
        JwtProperties missing = configured();
        missing.getAccessToken().setExpirationMinutes(null);
        assertThatThrownBy(missing::validate).isInstanceOf(IllegalStateException.class);
        JwtProperties ambiguous = configured();
        ambiguous.getRefreshToken().setExpirationMinutes(30);
        assertThatThrownBy(ambiguous::validate).isInstanceOf(IllegalStateException.class);
    }
}
