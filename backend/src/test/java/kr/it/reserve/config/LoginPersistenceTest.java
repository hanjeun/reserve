package kr.it.reserve.config;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.member.entity.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class LoginPersistenceTest {
    private JwtSessionFixture fixture() {
        return new JwtSessionFixture(Member.builder().id(1L).role(Role.USER).provider(AuthProvider.LOCAL)
                .name("합성 회원").email("fixture@example.test").password("synthetic-hash").build());
    }
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void signedPreferenceSurvivesRefreshAndThePreviousTokenGraceResponse(boolean persistent) {
        var fixture = fixture();
        var first = fixture.tokens.issueSession(fixture.member, null, persistent);
        assertThat(first.persistent()).isEqualTo(persistent);
        assertThat(fixture.claims(first.refreshToken()).get("persistent_login", Boolean.class)).isEqualTo(persistent);
        assertThat(fixture.tokens.verifyAuthentication(first.accessToken()).persistent()).isEqualTo(persistent);
        var rotated = fixture.service.refresh(first.refreshToken());
        var grace = fixture.service.refresh(first.refreshToken());
        assertThat(rotated.persistent()).isEqualTo(persistent);
        assertThat(grace.persistent()).isEqualTo(persistent);
        assertThat(grace.refreshToken()).isEqualTo(rotated.refreshToken());
        assertThat(fixture.claims(rotated.refreshToken()).get("persistent_login", Boolean.class)).isEqualTo(persistent);
        assertThat(fixture.tokens.verifyAuthentication(rotated.accessToken()).persistent()).isEqualTo(persistent);
        assertThat(fixture.service.refresh(rotated.refreshToken()).persistent()).isEqualTo(persistent);
        assertThat(fixture.row(rotated.refreshToken()).getAbsoluteExpiresAt())
                .isEqualTo(fixture.tokens.inspectRefreshToken(first.refreshToken()).absoluteExpiresAt());
    }
    @Test void legacySessionsKeepTheirOriginalCookiePolicyAndExactRefreshReconstruction() {
        var fixture = fixture();
        var first = fixture.issue(null);
        assertThat(fixture.claims(first.refreshToken())).doesNotContainKey("persistent_login");
        assertThat(fixture.tokens.inspectRefreshToken(first.refreshToken()).persistence()).isNull();
        var rotated = fixture.service.refresh(first.refreshToken());
        assertThat(rotated.persistent()).isTrue();
        assertThat(fixture.claims(rotated.refreshToken())).doesNotContainKey("persistent_login");
        assertThat(fixture.service.refresh(first.refreshToken()).refreshToken()).isEqualTo(rotated.refreshToken());
    }
    @Test void changingTheUnsignedPayloadCannotTurnOnPersistence() {
        var fixture = fixture();
        var first = fixture.tokens.issueSession(fixture.member, null, false);
        String[] parts = first.refreshToken().split("\\.");
        String body = new String(Base64.getUrlDecoder().decode(parts[1]), java.nio.charset.StandardCharsets.UTF_8)
                .replace("\"persistent_login\":false", "\"persistent_login\":true");
        String tampered = parts[0] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "." + parts[2];
        assertThat(fixture.tokens.inspectRefreshToken(tampered).state()).isEqualTo(TokenProvider.RefreshTokenState.INVALID);
        assertThatThrownBy(() -> fixture.service.refresh(tampered)).isInstanceOf(RuntimeException.class);
        assertThat(fixture.service.refresh(first.refreshToken()).persistent()).isFalse();
    }
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void cookiePersistenceIsAppliedToBothTokensWithoutChangingTheirSecurityAttributes(boolean persistent) {
        var response = new MockHttpServletResponse();
        new CookieUtil("prod").addAuthCookies(response, "synthetic-access", "synthetic-refresh", 1800, 1209600, persistent);
        var credentials = response.getHeaders("Set-Cookie").stream().filter(value -> !value.startsWith("refresh_token=;")).toList();
        assertThat(credentials).hasSize(3);
        for (String value : credentials) {
            assertThat(value).contains("HttpOnly", "Secure", "SameSite=Lax").doesNotContain("Domain=");
            if (persistent) assertThat(value).contains("Max-Age=");
            else assertThat(value).doesNotContain("Max-Age=", "Expires=");
        }
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(value -> value.startsWith("refresh_token=;") && value.contains("Max-Age=0"));
    }
}
